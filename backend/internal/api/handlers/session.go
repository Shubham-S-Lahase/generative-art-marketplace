package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/models"
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

	enriched := make([]bson.M, len(sessions))
	for i, s := range sessions {
		enriched[i] = h.enrichSession(s)
	}

	c.JSON(http.StatusOK, enriched)
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

	c.JSON(http.StatusOK, h.enrichSession(session))
}

func (h *SessionHandler) CreateSession(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req struct {
		Name              string         `json:"name" binding:"required"`
		Description       string         `json:"description"`
		MaxParticipants   int            `json:"maxParticipants"`
		IsPublic          bool           `json:"isPublic"`
		CurrentParameters map[string]any `json:"currentParameters"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hostID := userID.(primitive.ObjectID)
	hostName := h.lookupUsername(hostID)
	maxParticipants := req.MaxParticipants
	if maxParticipants <= 0 {
		maxParticipants = 10
	}

	defaultParams := bson.M{
		"colors":     []string{"#FF6B6B", "#4ECDC4", "#45B7D1"},
		"shapes":     []string{"circles"},
		"pattern":    "spiral",
		"complexity": 5,
		"seed":       time.Now().UnixNano() % 100000,
	}
	if len(req.CurrentParameters) > 0 {
		defaultParams = req.CurrentParameters
	}

	session := bson.M{
		"name":              req.Name,
		"description":       req.Description,
		"hostId":              hostID,
		"hostName":            hostName,
		"participants": []bson.M{
			{
				"userId":   hostID,
				"username": hostName,
				"joinedAt": time.Now(),
				"role":     "host",
			},
		},
		"maxParticipants":   maxParticipants,
		"isPublic":            req.IsPublic,
		"isActive":            true,
		"currentParameters": defaultParams,
		"createdAt":           time.Now(),
		"updatedAt":           time.Now(),
	}

	result, err := h.db.Sessions().InsertOne(context.TODO(), session)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	session["_id"] = result.InsertedID
	c.JSON(http.StatusCreated, h.enrichSession(session))
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
	deduped := dedupeParticipants(participants)
	if len(deduped) < len(participants) {
		_, _ = h.db.Sessions().UpdateOne(
			context.TODO(),
			bson.M{"_id": objectID},
			bson.M{"$set": bson.M{"participants": deduped, "updatedAt": time.Now()}},
		)
		participants = deduped
	}

	uid := userID.(primitive.ObjectID)
	if userInParticipants(participants, uid) {
		session["participants"] = deduped
		c.JSON(http.StatusOK, gin.H{
			"message": "Already in session",
			"session": h.enrichSession(session),
		})
		return
	}

	max := sessionMaxParticipants(session)
	if max > 0 && len(deduped) >= max {
		c.JSON(http.StatusForbidden, gin.H{"error": "Session full"})
		return
	}

	username := h.lookupUsername(uid)

	_, err = h.db.Sessions().UpdateOne(
		context.TODO(),
		bson.M{"_id": objectID},
		bson.M{
			"$push": bson.M{
				"participants": bson.M{
					"userId":   uid,
					"username": username,
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

	var updated bson.M
	if err := h.db.Sessions().FindOne(context.TODO(), bson.M{"_id": objectID}).Decode(&updated); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "Joined session successfully"})
		return
	}
	joinMsg, _ := json.Marshal(gin.H{
		"type":    "system",
		"payload": gin.H{"event": "participants_updated"},
	})
	h.wsHub.Broadcast(sessionID, joinMsg)

	c.JSON(http.StatusOK, gin.H{
		"message": "Joined session successfully",
		"session": h.enrichSession(updated),
	})
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

	var session bson.M
	if err := h.db.Sessions().FindOne(context.TODO(), bson.M{"_id": objectID}).Decode(&session); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	uid := userID.(primitive.ObjectID)
	hostID, _ := session["hostId"].(primitive.ObjectID)
	isHost := uid == hostID

	setFields := bson.M{"updatedAt": time.Now()}
	if isHost {
		setFields["isActive"] = false
	}

	_, err = h.db.Sessions().UpdateOne(
		context.TODO(),
		bson.M{"_id": objectID},
		bson.M{
			"$pull": bson.M{
				"participants": bson.M{"userId": uid},
			},
			"$set": setFields,
		},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to leave session"})
		return
	}

	username := h.lookupUsername(uid)
	if isHost {
		endMsg, _ := json.Marshal(gin.H{
			"type":     "system",
			"userId":   uid.Hex(),
			"username": username,
			"payload":  gin.H{"event": "session_ended", "text": username + " ended the session"},
		})
		h.wsHub.Broadcast(sessionID, endMsg)
	} else {
		leaveMsg, _ := json.Marshal(gin.H{
			"type":     "system",
			"userId":   uid.Hex(),
			"username": username,
			"payload":  gin.H{"event": "leave", "text": username + " left"},
		})
		h.wsHub.Broadcast(sessionID, leaveMsg)
	}

	msg := "Left session successfully"
	if isHost {
		msg = "Session ended"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "ended": isHost})
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
	joinUsername := h.lookupUsernameFromHex(claims.UserID)
	joinMsg, _ := json.Marshal(gin.H{
		"type":     "system",
		"userId":   claims.UserID,
		"username": joinUsername,
		"payload":  gin.H{"event": "join", "text": joinUsername + " joined"},
	})
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
	leaveUsername := h.lookupUsernameFromHex(claims.UserID)
	leaveMsg, _ := json.Marshal(gin.H{
		"type":     "system",
		"userId":   claims.UserID,
		"username": leaveUsername,
		"payload":  gin.H{"event": "leave", "text": leaveUsername + " left"},
	})
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
		"type":     incoming.Type,
		"userId":   userID,
		"username": h.lookupUsernameFromHex(userID),
		"payload":  incoming.Payload,
		"sentAt":   time.Now().UnixMilli(),
	}
	b, err := json.Marshal(outgoing)
	if err != nil {
		return nil
	}
	return b
}

func (h *SessionHandler) lookupUsername(userID primitive.ObjectID) string {
	var user models.User
	if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": userID}).Decode(&user); err == nil {
		return user.Username
	}
	return "User"
}

func (h *SessionHandler) lookupUsernameFromHex(userID string) string {
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return "User"
	}
	return h.lookupUsername(oid)
}

func participantUserID(doc bson.M) (primitive.ObjectID, bool) {
	switch v := doc["userId"].(type) {
	case primitive.ObjectID:
		return v, true
	default:
		return primitive.NilObjectID, false
	}
}

func userInParticipants(parts primitive.A, uid primitive.ObjectID) bool {
	for _, p := range parts {
		doc, ok := p.(bson.M)
		if !ok {
			continue
		}
		if id, ok := participantUserID(doc); ok && id == uid {
			return true
		}
	}
	return false
}

func dedupeParticipants(parts primitive.A) primitive.A {
	if len(parts) == 0 {
		return parts
	}
	seen := make(map[primitive.ObjectID]bson.M)
	order := make([]primitive.ObjectID, 0, len(parts))
	for _, p := range parts {
		doc, ok := p.(bson.M)
		if !ok {
			continue
		}
		uid, ok := participantUserID(doc)
		if !ok {
			continue
		}
		if _, has := seen[uid]; has {
			if role, _ := doc["role"].(string); role == "host" {
				seen[uid] = doc
			}
			continue
		}
		seen[uid] = doc
		order = append(order, uid)
	}
	out := make(primitive.A, 0, len(order))
	for _, uid := range order {
		out = append(out, seen[uid])
	}
	return out
}

func sessionMaxParticipants(session bson.M) int {
	switch v := session["maxParticipants"].(type) {
	case int32:
		return int(v)
	case int64:
		return int(v)
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

func (h *SessionHandler) enrichSession(session bson.M) bson.M {
	if session == nil {
		return bson.M{}
	}

	if hostID, ok := session["hostId"].(primitive.ObjectID); ok {
		session["hostName"] = h.lookupUsername(hostID)
	}

	if parts, ok := session["participants"].(primitive.A); ok {
		parts = dedupeParticipants(parts)
		enriched := make(primitive.A, 0, len(parts))
		for _, p := range parts {
			doc, ok := p.(bson.M)
			if !ok {
				enriched = append(enriched, p)
				continue
			}
			if _, has := doc["username"]; !has {
				if uid, ok := doc["userId"].(primitive.ObjectID); ok {
					doc["username"] = h.lookupUsername(uid)
				}
			}
			enriched = append(enriched, doc)
		}
		session["participants"] = enriched
	}

	if session["currentParameters"] == nil {
		session["currentParameters"] = bson.M{
			"colors":     []string{"#FF6B6B", "#4ECDC4", "#45B7D1"},
			"shapes":     []string{"circles"},
			"pattern":    "spiral",
			"complexity": 5,
			"seed":       1,
		}
	}

	return session
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
