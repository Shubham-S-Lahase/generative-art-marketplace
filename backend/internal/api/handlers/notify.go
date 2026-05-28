package handlers

import (
	"context"
	"time"

	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

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
	_, _ = db.Notifications().InsertOne(context.TODO(), notification)
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
