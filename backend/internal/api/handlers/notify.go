package handlers

import (
	"context"
	"time"

	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/database"

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

