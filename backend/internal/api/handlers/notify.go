package handlers

import (
	"context"
	"encoding/json"
	"time"

	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/internal/websocket"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var realtimeUserHub *websocket.UserHub

func SetRealtimeUserHub(h *websocket.UserHub) {
	realtimeUserHub = h
}

func createNotification(db *database.MongoDB, userID primitive.ObjectID, notifType, title, message string, sourceID *primitive.ObjectID) {
	createNotificationIfAllowed(db, userID, notifType, title, message, sourceID)
}

func createNotificationIfAllowed(db *database.MongoDB, userID primitive.ObjectID, notifType, title, message string, sourceID *primitive.ObjectID) {
	if userID.IsZero() {
		return
	}
	var user models.User
	if err := db.Users().FindOne(context.TODO(), bson.M{"_id": userID}).Decode(&user); err == nil {
		prefs := user.NotificationPrefs
		if prefs.Likes == false && prefs.Comments == false && prefs.Follows == false && prefs.Purchases == false {
			prefs = models.DefaultNotificationPrefs()
		}
		switch notifType {
		case "like":
			if !prefs.Likes {
				return
			}
		case "comment", "mention":
			if !prefs.Comments {
				return
			}
		case "follow":
			if !prefs.Follows {
				return
			}
		case "purchase":
			if !prefs.Purchases {
				return
			}
		case "message":
			if !prefs.Comments {
				return
			}
		}
	}
	notification := models.Notification{
		UserID:    userID,
		Type:      notifType,
		Title:     title,
		Message:   message,
		SourceID:  sourceID,
		IsRead:    false,
		CreatedAt: time.Now(),
	}
	res, err := db.Notifications().InsertOne(context.TODO(), notification)
	if err != nil {
		return
	}
	if oid, ok := res.InsertedID.(primitive.ObjectID); ok {
		notification.ID = oid
	}
	emitRealtimeNotification(notification)
}

func emitRealtimeNotification(n models.Notification) {
	if realtimeUserHub == nil || n.UserID.IsZero() {
		return
	}
	item := gin.H{
		"id":        n.ID.Hex(),
		"type":      n.Type,
		"title":     n.Title,
		"message":   n.Message,
		"isRead":    n.IsRead,
		"read":      n.IsRead,
		"createdAt": n.CreatedAt,
	}
	if n.SourceID != nil {
		item["sourceId"] = n.SourceID.Hex()
	}
	payload, err := json.Marshal(gin.H{
		"type":    "notification:new",
		"payload": item,
		"sentAt":  time.Now().UnixMilli(),
	})
	if err != nil {
		return
	}
	realtimeUserHub.BroadcastToUser(n.UserID.Hex(), payload)
}

func formatNotificationsForAPI(notifications []models.Notification) []gin.H {
	out := make([]gin.H, 0, len(notifications))
	for _, n := range notifications {
		item := gin.H{
			"id":        n.ID.Hex(),
			"type":      n.Type,
			"title":     n.Title,
			"message":   n.Message,
			"isRead":    n.IsRead,
			"read":      n.IsRead,
			"createdAt": n.CreatedAt,
		}
		if n.SourceID != nil {
			item["sourceId"] = n.SourceID.Hex()
		}
		out = append(out, item)
	}
	return out
}
