package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/websocket"
	"generative-art-marketplace/pkg/auth"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	ws "github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type SessionHandler struct {
	db    *database.MongoDB
	wsHub *websocket.Hub
	cfg   *config.Config
}

func NewSessionHandler(db *database.MongoDB, wsHub *websocket.Hub, cfg *config.Config) *SessionHandler {
	return &SessionHandler{
		db:    db,
		wsHub: wsHub,
		cfg:   cfg,
	}
}

func (h *SessionHandler) GetSessions(c *gin.Context) {
	cursor, err := h.db.Sessions().Find(context.TODO(), bson.M{"isActive": true})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch sessions"})
		return
	}
	defer cursor.Close(context.TODO())

	var sessions []bson.M
	if err = cursor.All(context.TODO(), &sessions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode sessions"})
		return
	}

	c.JSON(http.StatusOK, sessions)
}

func (h *SessionHandler) GetSession(c *gin.Context) {
	id := c.Param("id")
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	var session bson.M
	err = h.db.Sessions().FindOne(context.TODO(), bson.M{"_id": objectID}).Decode(&session)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, session)
}

func (h *SessionHandler) CreateSession(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		MaxParticipants int    `json:"maxParticipants"`
		IsPublic    bool   `json:"isPublic"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	session := bson.M{
		"name":           req.Name,
		"description":    req.Description,
		"hostId":         userID,
		"participants": []bson.M{
			{"userId": userID, "joinedAt": time.Now(), "role": "host"},
		},
		"maxParticipants": req.MaxParticipants,
		"isPublic":       req.IsPublic,
		"isActive":       true,
		"currentParameters": bson.M{},
		"createdAt":      time.Now(),
		"updatedAt":      time.Now(),
	}

	result, err := h.db.Sessions().InsertOne(context.TODO(), session)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	session["_id"] = result.InsertedID
	c.JSON(http.StatusCreated, session)
}

func (h *SessionHandler) JoinSession(c *gin.Context) {
	sessionID := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objectID, err := primitive.ObjectIDFromHex(sessionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Add user to session participants
	var session bson.M
	if err := h.db.Sessions().FindOne(context.TODO(), bson.M{"_id": objectID}).Decode(&session); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	participants, _ := session["participants"].(primitive.A)
	max, _ := session["maxParticipants"].(int32)
	if max > 0 && len(participants) >= int(max) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Session full"})
		return
	}

	_, err = h.db.Sessions().UpdateOne(
		context.TODO(),
		bson.M{"_id": objectID},
		bson.M{
			"$addToSet": bson.M{
				"participants": bson.M{
					"userId":   userID,
					"joinedAt": time.Now(),
					"role":     "participant",
				},
			},
			"$set": bson.M{"updatedAt": time.Now()},
		},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Joined session successfully"})
}

func (h *SessionHandler) LeaveSession(c *gin.Context) {
	sessionID := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objectID, err := primitive.ObjectIDFromHex(sessionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Remove user from session participants
	_, err = h.db.Sessions().UpdateOne(
		context.TODO(),
		bson.M{"_id": objectID},
		bson.M{
			"$pull": bson.M{
				"participants": bson.M{"userId": userID},
			},
			"$set": bson.M{"updatedAt": time.Now()},
		},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to leave session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Left session successfully"})
}

func (h *SessionHandler) DeleteSession(c *gin.Context) {
	sessionID := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objectID, err := primitive.ObjectIDFromHex(sessionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Delete session (only if user is the host)
	result, err := h.db.Sessions().DeleteOne(context.TODO(), bson.M{
		"_id":    objectID,
		"hostId": userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete session"})
		return
	}

	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found or not owned by user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Session deleted successfully"})
}

// HandleWebSocket upgrades the connection and registers the client in the hub.
func (h *SessionHandler) HandleWebSocket(c *gin.Context) {
	sessionID := c.Param("id")
	token := extractWSToken(c, h.cfg.CookieName)

	claims, err := auth.ParseAndValidate(h.cfg.JWTSecret, token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	upgrader := ws.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := &websocket.Client{
		Conn:      conn,
		UserID:    claims.UserID,
		SessionID: sessionID,
		Send:      make(chan []byte, 256),
	}

	h.wsHub.Register(sessionID, client)
	// Notify others of join
	joinMsg, _ := json.Marshal(gin.H{"type": "system", "payload": gin.H{"event": "join", "userId": claims.UserID}})
	h.wsHub.Broadcast(sessionID, joinMsg)

	// Writer
	go func() {
		for msg := range client.Send {
			if err := conn.WriteMessage(ws.TextMessage, msg); err != nil {
				break
			}
		}
	}()

	// Reader
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}
		out := h.normalizeMessage(sessionID, claims.UserID, message)
		if out != nil {
			h.wsHub.Broadcast(sessionID, out)
		}
	}

	h.wsHub.Unregister(sessionID, client)
	leaveMsg, _ := json.Marshal(gin.H{"type": "system", "payload": gin.H{"event": "leave", "userId": claims.UserID}})
	h.wsHub.Broadcast(sessionID, leaveMsg)
	conn.Close()
}

type incomingMessage struct {
	Type    string                 `json:"type"`
	Payload map[string]interface{} `json:"payload"`
}

func (h *SessionHandler) normalizeMessage(sessionID, userID string, raw []byte) []byte {
	var incoming incomingMessage
	if err := json.Unmarshal(raw, &incoming); err != nil {
		return nil
	}

	switch incoming.Type {
	case "chat":
		// pass through
	case "params":
		// update session parameters
		if oid, err := primitive.ObjectIDFromHex(sessionID); err == nil {
			_, _ = h.db.Sessions().UpdateOne(
				context.TODO(),
				bson.M{"_id": oid},
				bson.M{"$set": bson.M{"currentParameters": incoming.Payload, "updatedAt": time.Now()}},
			)
		}
	case "system":
	default:
		return nil
	}

	outgoing := gin.H{
		"type":    incoming.Type,
		"userId":  userID,
		"payload": incoming.Payload,
		"sentAt":  time.Now().UnixMilli(),
	}
	b, err := json.Marshal(outgoing)
	if err != nil {
		return nil
	}
	return b
}

func extractWSToken(c *gin.Context, cookieName string) string {
	authHeader := c.GetHeader("Authorization")
	if len(authHeader) > 7 && (authHeader[:7] == "Bearer " || authHeader[:7] == "bearer ") {
		return authHeader[7:]
	}
	if t, err := c.Cookie(cookieName); err == nil && t != "" {
		return t
	}
	// Support token via query param or Sec-WebSocket-Protocol for browsers
	if t := c.Query("token"); t != "" {
		return t
	}
	// Use canonical header key: "Sec-Websocket-Protocol" (lowercase 'socket')
	if protocol := c.Request.Header.Get("Sec-Websocket-Protocol"); protocol != "" {
		return protocol
	}
	return ""
}
