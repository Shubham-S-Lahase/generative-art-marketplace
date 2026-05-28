package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MessageHandler struct {
	db *database.MongoDB
}

func NewMessageHandler(db *database.MongoDB) *MessageHandler {
	return &MessageHandler{db: db}
}

func (h *MessageHandler) CreateOrGetConversation(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	me := userID.(primitive.ObjectID)

	var req struct {
		PeerUserID string `json:"peerUserId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	peerID, err := primitive.ObjectIDFromHex(strings.TrimSpace(req.PeerUserID))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid peer user ID"})
		return
	}
	if peerID == me {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot message yourself"})
		return
	}
	if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": peerID}).Err(); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Peer user not found"})
		return
	}

	participantIDs := sortedParticipantIDs(me, peerID)
	now := time.Now()
	participantKey := participantKey(participantIDs)

	update := bson.M{
		"$setOnInsert": bson.M{
			"participantIds": participantIDs,
			"participantKey": participantKey,
			"createdAt":      now,
			"updatedAt":      now,
			"lastSeq":        int64(0),
		},
	}
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)

	var conv models.Conversation
	if err := h.db.Conversations().FindOneAndUpdate(
		context.TODO(),
		bson.M{"participantKey": participantKey},
		update,
		opts,
	).Decode(&conv); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create conversation"})
		return
	}
	h.respondConversation(c, me, conv, 0)
}

func (h *MessageHandler) GetConversations(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	me := userID.(primitive.ObjectID)

	cursor, err := h.db.Conversations().Find(
		context.TODO(),
		bson.M{"participantIds": me},
		options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}).SetLimit(500),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load conversations"})
		return
	}
	defer cursor.Close(context.TODO())

	var convs []models.Conversation
	if err := cursor.All(context.TODO(), &convs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode conversations"})
		return
	}

	readCursor, err := h.db.ConversationReads().Find(
		context.TODO(),
		bson.M{"conversationId": bson.M{"$in": conversationIDs(convs)}},
	)
	readStateByConversation := map[primitive.ObjectID]map[primitive.ObjectID]int64{}
	if err == nil {
		var reads []models.ConversationRead
		if readCursor.All(context.TODO(), &reads) == nil {
			for _, r := range reads {
				if _, ok := readStateByConversation[r.ConversationID]; !ok {
					readStateByConversation[r.ConversationID] = map[primitive.ObjectID]int64{}
				}
				readStateByConversation[r.ConversationID][r.UserID] = r.LastReadMessageSeq
			}
		}
		_ = readCursor.Close(context.TODO())
	}

	out := make([]gin.H, 0, len(convs))
	for _, conv := range convs {
		myLastReadSeq := readStateByConversation[conv.ID][me]
		peerLastReadSeq := readSeqForPeer(conv, me, readStateByConversation[conv.ID])
		unread := conv.LastSeq - myLastReadSeq
		if unread < 0 {
			unread = 0
		}
		out = append(out, h.conversationResponse(me, conv, unread, myLastReadSeq, peerLastReadSeq))
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

	conversationID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}
	conv, err := h.requireConversationMembership(me, conversationID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
			return
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a conversation participant"})
		return
	}

	limit := 50
	if v := strings.TrimSpace(c.Query("limit")); v != "" {
		if parsed, parseErr := parsePositiveInt(v, 200); parseErr == nil {
			limit = parsed
		}
	}
	filter := bson.M{"conversationId": conversationID}
	if beforeSeq := strings.TrimSpace(c.Query("beforeSeq")); beforeSeq != "" {
		if parsed, parseErr := parsePositiveInt64(beforeSeq); parseErr == nil && parsed > 0 {
			filter["seq"] = bson.M{"$lt": parsed}
		}
	}

	cursor, err := h.db.ConversationMessages().Find(
		context.TODO(),
		filter,
		options.Find().SetSort(bson.D{{Key: "seq", Value: -1}}).SetLimit(int64(limit)),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load messages"})
		return
	}
	defer cursor.Close(context.TODO())

	var msgs []models.ConversationMessage
	if err := cursor.All(context.TODO(), &msgs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode messages"})
		return
	}
	sort.Slice(msgs, func(i, j int) bool { return msgs[i].Seq < msgs[j].Seq })
	readState := readStateForConversation(conv.ID, h.db)
	myLastReadSeq := readState[me]
	peerLastReadSeq := readSeqForPeer(conv, me, readState)

	out := make([]gin.H, 0, len(msgs))
	for _, msg := range msgs {
		out = append(out, gin.H{
			"id":              msg.ID.Hex(),
			"conversationId":  conversationID.Hex(),
			"senderId":        msg.SenderID.Hex(),
			"text":            msg.Text,
			"clientMessageId": msg.ClientMessageID,
			"seq":             msg.Seq,
			"createdAt":       msg.CreatedAt,
			"isMine":          msg.SenderID == me,
			"isRead":          msg.Seq <= peerLastReadSeq,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"messages":        out,
		"myLastReadSeq":   myLastReadSeq,
		"peerLastReadSeq": peerLastReadSeq,
	})
}

func (h *MessageHandler) SendConversationMessage(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	me := userID.(primitive.ObjectID)

	conversationID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}
	conv, err := h.requireConversationMembership(me, conversationID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
			return
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a conversation participant"})
		return
	}

	var req struct {
		Text            string `json:"text" binding:"required"`
		ClientMessageID string `json:"clientMessageId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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

	clientMessageID := strings.TrimSpace(req.ClientMessageID)
	if clientMessageID != "" {
		var existing models.ConversationMessage
		findErr := h.db.ConversationMessages().FindOne(
			context.TODO(),
			bson.M{
				"conversationId":  conversationID,
				"senderId":        me,
				"clientMessageId": clientMessageID,
			},
		).Decode(&existing)
		if findErr == nil {
			c.JSON(http.StatusOK, messageResponse(existing, me))
			return
		}
		if !errors.Is(findErr, mongo.ErrNoDocuments) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
			return
		}
	}

	now := time.Now()
	var updatedConv models.Conversation
	convUpdateErr := h.db.Conversations().FindOneAndUpdate(
		context.TODO(),
		bson.M{"_id": conv.ID},
		bson.M{
			"$inc": bson.M{"lastSeq": 1},
			"$set": bson.M{
				"updatedAt":          now,
				"lastMessageAt":      now,
				"lastMessagePreview": text,
			},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updatedConv)
	if convUpdateErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}

	msg := models.ConversationMessage{
		ConversationID:  conversationID,
		SenderID:        me,
		Text:            text,
		ClientMessageID: clientMessageID,
		Seq:             updatedConv.LastSeq,
		CreatedAt:       now,
	}
	res, err := h.db.ConversationMessages().InsertOne(context.TODO(), msg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}
	msg.ID = res.InsertedID.(primitive.ObjectID)

	_, _ = h.db.Conversations().UpdateByID(
		context.TODO(),
		conv.ID,
		bson.M{"$set": bson.M{"lastMessageId": msg.ID}},
	)

	_, _ = h.db.ConversationReads().UpdateOne(
		context.TODO(),
		bson.M{"conversationId": conversationID, "userId": me},
		bson.M{"$set": bson.M{"lastReadMessageSeq": msg.Seq, "updatedAt": now}},
		options.Update().SetUpsert(true),
	)

	peerID := peerFromConversation(conv, me)
	senderName := "Someone"
	var sender models.User
	if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": me}).Decode(&sender); err == nil && strings.TrimSpace(sender.Username) != "" {
		senderName = sender.Username
	}
	createNotificationIfAllowed(h.db, peerID, "message", "New message", senderName+" sent you a direct message", nil)

	h.emitRealtimeConversationMessage(msg, conv, peerID)
	c.JSON(http.StatusCreated, messageResponse(msg, me))
}

func (h *MessageHandler) MarkConversationRead(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	me := userID.(primitive.ObjectID)

	conversationID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}
	conv, err := h.requireConversationMembership(me, conversationID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a conversation participant"})
		return
	}

	var req struct {
		LastReadSeq int64 `json:"lastReadSeq" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.LastReadSeq < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid lastReadSeq"})
		return
	}

	_, err = h.db.ConversationReads().UpdateOne(
		context.TODO(),
		bson.M{"conversationId": conversationID, "userId": me},
		bson.M{
			"$max": bson.M{"lastReadMessageSeq": req.LastReadSeq},
			"$set": bson.M{"updatedAt": time.Now()},
		},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update read state"})
		return
	}
	h.emitRealtimeMessageRead(conv, me, req.LastReadSeq)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *MessageHandler) emitRealtimeConversationMessage(msg models.ConversationMessage, conv models.Conversation, peerID primitive.ObjectID) {
	if realtimeUserHub == nil {
		return
	}
	body := gin.H{
		"id":              msg.ID.Hex(),
		"conversationId":  msg.ConversationID.Hex(),
		"senderId":        msg.SenderID.Hex(),
		"receiverId":      peerID.Hex(),
		"text":            msg.Text,
		"clientMessageId": msg.ClientMessageID,
		"seq":             msg.Seq,
		"createdAt":       msg.CreatedAt,
	}
	payload, err := json.Marshal(gin.H{
		"type":    "message:new",
		"payload": body,
		"sentAt":  time.Now().UnixMilli(),
	})
	if err != nil {
		return
	}
	realtimeUserHub.BroadcastToUser(peerID.Hex(), payload)
	realtimeUserHub.BroadcastToUser(msg.SenderID.Hex(), payload)

	conversationEvent, err := json.Marshal(gin.H{
		"type": "conversation.updated",
		"payload": gin.H{
			"conversationId":     conv.ID.Hex(),
			"lastMessageId":      msg.ID.Hex(),
			"lastMessagePreview": msg.Text,
			"lastMessageAt":      msg.CreatedAt,
			"lastSenderId":       msg.SenderID.Hex(),
			"lastSeq":            msg.Seq,
		},
		"sentAt": time.Now().UnixMilli(),
	})
	if err == nil {
		realtimeUserHub.BroadcastToUser(peerID.Hex(), conversationEvent)
		realtimeUserHub.BroadcastToUser(msg.SenderID.Hex(), conversationEvent)
	}
}

func (h *MessageHandler) emitRealtimeMessageRead(conv models.Conversation, readerID primitive.ObjectID, lastReadSeq int64) {
	if realtimeUserHub == nil {
		return
	}
	peerID := peerFromConversation(conv, readerID)
	payload, err := json.Marshal(gin.H{
		"type": "message.read",
		"payload": gin.H{
			"conversationId": conv.ID.Hex(),
			"readerUserId":   readerID.Hex(),
			"lastReadSeq":    lastReadSeq,
		},
		"sentAt": time.Now().UnixMilli(),
	})
	if err != nil {
		return
	}
	realtimeUserHub.BroadcastToUser(readerID.Hex(), payload)
	realtimeUserHub.BroadcastToUser(peerID.Hex(), payload)
}

func sortedParticipantIDs(a, b primitive.ObjectID) []primitive.ObjectID {
	out := []primitive.ObjectID{a, b}
	sort.Slice(out, func(i, j int) bool { return out[i].Hex() < out[j].Hex() })
	return out
}

func participantKey(ids []primitive.ObjectID) string {
	parts := make([]string, 0, len(ids))
	for _, id := range ids {
		parts = append(parts, id.Hex())
	}
	sort.Strings(parts)
	return strings.Join(parts, ":")
}

func peerFromConversation(conv models.Conversation, me primitive.ObjectID) primitive.ObjectID {
	for _, id := range conv.ParticipantIDs {
		if id != me {
			return id
		}
	}
	return primitive.NilObjectID
}

func (h *MessageHandler) requireConversationMembership(me, conversationID primitive.ObjectID) (models.Conversation, error) {
	var conv models.Conversation
	if err := h.db.Conversations().FindOne(context.TODO(), bson.M{"_id": conversationID}).Decode(&conv); err != nil {
		return conv, err
	}
	for _, id := range conv.ParticipantIDs {
		if id == me {
			return conv, nil
		}
	}
	return conv, errors.New("membership denied")
}

func (h *MessageHandler) conversationResponse(me primitive.ObjectID, conv models.Conversation, unread, myLastReadSeq, peerLastReadSeq int64) gin.H {
	peerID := peerFromConversation(conv, me)
	peerUsername, peerAvatar := h.lookupPeerProfile(peerID)
	return gin.H{
		"id":                 conv.ID.Hex(),
		"peerUserId":         peerID.Hex(),
		"peerUsername":       peerUsername,
		"peerAvatarUrl":      peerAvatar,
		"lastMessagePreview": conv.LastMessagePreview,
		"lastMessageAt":      conv.LastMessageAt,
		"updatedAt":          conv.UpdatedAt,
		"lastSeq":            conv.LastSeq,
		"unreadCount":        unread,
		"myLastReadSeq":      myLastReadSeq,
		"peerLastReadSeq":    peerLastReadSeq,
	}
}

func (h *MessageHandler) respondConversation(c *gin.Context, me primitive.ObjectID, conv models.Conversation, unread int64) {
	c.JSON(http.StatusOK, h.conversationResponse(me, conv, unread, 0, 0))
}

func (h *MessageHandler) lookupPeerProfile(peerID primitive.ObjectID) (string, string) {
	var peer models.User
	if err := h.db.Users().FindOne(
		context.TODO(),
		bson.M{"_id": peerID},
		options.FindOne().SetProjection(bson.M{"username": 1, "avatarUrl": 1}),
	).Decode(&peer); err != nil {
		return "", ""
	}
	return strings.TrimSpace(peer.Username), strings.TrimSpace(peer.AvatarURL)
}

func messageResponse(msg models.ConversationMessage, me primitive.ObjectID) gin.H {
	return gin.H{
		"id":              msg.ID.Hex(),
		"conversationId":  msg.ConversationID.Hex(),
		"senderId":        msg.SenderID.Hex(),
		"text":            msg.Text,
		"clientMessageId": msg.ClientMessageID,
		"seq":             msg.Seq,
		"createdAt":       msg.CreatedAt,
		"isMine":          msg.SenderID == me,
	}
}

func parsePositiveInt(value string, max int) (int, error) {
	parsed, err := parsePositiveInt64(value)
	if err != nil {
		return 0, err
	}
	if parsed > int64(max) {
		return max, nil
	}
	return int(parsed), nil
}

func parsePositiveInt64(value string) (int64, error) {
	return strconv.ParseInt(value, 10, 64)
}

func conversationIDs(convs []models.Conversation) []primitive.ObjectID {
	ids := make([]primitive.ObjectID, 0, len(convs))
	for _, c := range convs {
		ids = append(ids, c.ID)
	}
	return ids
}

func readStateForConversation(conversationID primitive.ObjectID, db *database.MongoDB) map[primitive.ObjectID]int64 {
	state := map[primitive.ObjectID]int64{}
	cursor, err := db.ConversationReads().Find(context.TODO(), bson.M{"conversationId": conversationID})
	if err != nil {
		return state
	}
	defer cursor.Close(context.TODO())
	var reads []models.ConversationRead
	if err := cursor.All(context.TODO(), &reads); err != nil {
		return state
	}
	for _, read := range reads {
		state[read.UserID] = read.LastReadMessageSeq
	}
	return state
}

func readSeqForPeer(conv models.Conversation, me primitive.ObjectID, readState map[primitive.ObjectID]int64) int64 {
	if readState == nil {
		return 0
	}
	for _, participantID := range conv.ParticipantIDs {
		if participantID != me {
			return readState[participantID]
		}
	}
	return 0
}
