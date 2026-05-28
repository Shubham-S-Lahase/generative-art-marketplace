package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MessageHandler struct {
	db *database.MongoDB
}

func NewMessageHandler(db *database.MongoDB) *MessageHandler {
	return &MessageHandler{db: db}
}

func (h *MessageHandler) SendMessage(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	senderID := userID.(primitive.ObjectID)

	var req struct {
		ReceiverID string `json:"receiverId" binding:"required"`
		Text       string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	receiverID, err := primitive.ObjectIDFromHex(strings.TrimSpace(req.ReceiverID))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid receiver ID"})
		return
	}
	if receiverID == senderID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot message yourself"})
		return
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message cannot be empty"})
		return
	}
	if len(text) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message too long"})
		return
	}

	msg := models.DirectMessage{
		Participants: []primitive.ObjectID{senderID, receiverID},
		SenderID:     senderID,
		ReceiverID:   receiverID,
		Text:         text,
		ReadBy:       []primitive.ObjectID{senderID},
		CreatedAt:    time.Now(),
	}

	res, err := h.db.DirectMessages().InsertOne(context.TODO(), msg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}
	msg.ID = res.InsertedID.(primitive.ObjectID)

	senderName := "Someone"
	var sender models.User
	if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": senderID}).Decode(&sender); err == nil && strings.TrimSpace(sender.Username) != "" {
		senderName = sender.Username
	}
	createNotificationIfAllowed(h.db, receiverID, "message", "New message", senderName+" sent you a direct message", nil)

	c.JSON(http.StatusCreated, gin.H{
		"id":         msg.ID.Hex(),
		"senderId":   msg.SenderID.Hex(),
		"receiverId": msg.ReceiverID.Hex(),
		"text":       msg.Text,
		"createdAt":  msg.CreatedAt,
	})
}

func (h *MessageHandler) GetConversations(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	me := userID.(primitive.ObjectID)

	cursor, err := h.db.DirectMessages().Find(
		context.TODO(),
		bson.M{"participants": me},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(500),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load conversations"})
		return
	}
	defer cursor.Close(context.TODO())

	var msgs []models.DirectMessage
	if err := cursor.All(context.TODO(), &msgs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode conversations"})
		return
	}

	type convo struct {
		PeerID      primitive.ObjectID
		LastText    string
		LastAt      time.Time
		LastSender  primitive.ObjectID
		UnreadCount int
	}
	conversations := map[primitive.ObjectID]*convo{}
	peerIDs := make([]primitive.ObjectID, 0)
	seenPeers := map[primitive.ObjectID]bool{}

	for _, m := range msgs {
		peerID := m.SenderID
		if m.SenderID == me {
			peerID = m.ReceiverID
		}
		cv, exists := conversations[peerID]
		if !exists {
			cv = &convo{
				PeerID:     peerID,
				LastText:   m.Text,
				LastAt:     m.CreatedAt,
				LastSender: m.SenderID,
			}
			conversations[peerID] = cv
		}
		if m.SenderID != me && !containsObjectID(m.ReadBy, me) {
			cv.UnreadCount++
		}
		if !seenPeers[peerID] {
			seenPeers[peerID] = true
			peerIDs = append(peerIDs, peerID)
		}
	}

	userByID := map[primitive.ObjectID]models.User{}
	if len(peerIDs) > 0 {
		ucursor, err := h.db.Users().Find(
			context.TODO(),
			bson.M{"_id": bson.M{"$in": peerIDs}},
			options.Find().SetProjection(bson.M{"username": 1, "avatarUrl": 1}),
		)
		if err == nil {
			var users []models.User
			if ucursor.All(context.TODO(), &users) == nil {
				for _, u := range users {
					userByID[u.ID] = u
				}
			}
			_ = ucursor.Close(context.TODO())
		}
	}

	out := make([]gin.H, 0, len(conversations))
	for _, cv := range conversations {
		peer := userByID[cv.PeerID]
		out = append(out, gin.H{
			"peerId":        cv.PeerID.Hex(),
			"peerUsername":  peer.Username,
			"peerAvatarUrl": peer.AvatarURL,
			"lastMessage":   cv.LastText,
			"lastSenderId":  cv.LastSender.Hex(),
			"lastAt":        cv.LastAt,
			"unreadCount":   cv.UnreadCount,
		})
	}
	c.JSON(http.StatusOK, out)
}

func (h *MessageHandler) GetConversationMessages(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	me := userID.(primitive.ObjectID)

	peerID, err := primitive.ObjectIDFromHex(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	filter := bson.M{
		"participants": bson.M{"$all": []primitive.ObjectID{me, peerID}},
	}
	cursor, err := h.db.DirectMessages().Find(
		context.TODO(),
		filter,
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}).SetLimit(300),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load messages"})
		return
	}
	defer cursor.Close(context.TODO())

	var msgs []models.DirectMessage
	if err := cursor.All(context.TODO(), &msgs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode messages"})
		return
	}

	_, _ = h.db.DirectMessages().UpdateMany(
		context.TODO(),
		bson.M{
			"participants": bson.M{"$all": []primitive.ObjectID{me, peerID}},
			"senderId":     bson.M{"$ne": me},
			"readBy":       bson.M{"$nin": []primitive.ObjectID{me}},
		},
		bson.M{"$addToSet": bson.M{"readBy": me}},
	)

	out := make([]gin.H, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, gin.H{
			"id":         m.ID.Hex(),
			"senderId":   m.SenderID.Hex(),
			"receiverId": m.ReceiverID.Hex(),
			"text":       m.Text,
			"createdAt":  m.CreatedAt,
			"isMine":     m.SenderID == me,
			"isRead":     containsObjectID(m.ReadBy, me),
		})
	}
	c.JSON(http.StatusOK, out)
}

func containsObjectID(ids []primitive.ObjectID, target primitive.ObjectID) bool {
	for _, id := range ids {
		if id == target {
			return true
		}
	}
	return false
}
