package handlers

import (
	"context"
	"time"

	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func createNotification(db *database.MongoDB, userID primitive.ObjectID, notifType, title, message string, sourceID *primitive.ObjectID) {
	if userID.IsZero() {
		return
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

