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

type PresetHandler struct {
	db *database.MongoDB
}

func NewPresetHandler(db *database.MongoDB) *PresetHandler {
	return &PresetHandler{db: db}
}

func (h *PresetHandler) ensureDefaultPresets() {
	count, _ := h.db.Presets().CountDocuments(context.TODO(), bson.M{"isPublic": true})
	if count > 0 {
		return
	}
	defaults := []models.Preset{
		{
			Name: "Sunset Spiral",
			Parameters: map[string]any{
				"pattern": "spiral", "complexity": 6, "seed": 42,
				"colors": []string{"#FF6B6B", "#FFE66D", "#4ECDC4"},
			},
			IsPublic: true, CreatedAt: time.Now(),
		},
		{
			Name: "Neon Grid",
			Parameters: map[string]any{
				"pattern": "geometric", "complexity": 8, "seed": 7,
				"colors": []string{"#6366f1", "#a855f7", "#ec4899"},
			},
			IsPublic: true, CreatedAt: time.Now(),
		},
		{
			Name: "Organic Flow",
			Parameters: map[string]any{
				"pattern": "organic", "complexity": 5, "seed": 99,
				"colors": []string{"#10b981", "#3b82f6", "#f59e0b"},
			},
			IsPublic: true, CreatedAt: time.Now(),
		},
	}
	for _, p := range defaults {
		_, _ = h.db.Presets().InsertOne(context.TODO(), p)
	}
}

func (h *PresetHandler) ListPresets(c *gin.Context) {
	h.ensureDefaultPresets()

	filter := bson.M{"$or": []bson.M{
		{"isPublic": true},
	}}
	if uid, exists := c.Get("userID"); exists {
		filter = bson.M{"$or": []bson.M{
			{"isPublic": true},
			{"userId": uid.(primitive.ObjectID)},
		}}
	}

	cursor, err := h.db.Presets().Find(context.TODO(), filter, options.Find().SetSort(bson.M{"createdAt": -1}).SetLimit(50))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load presets"})
		return
	}
	defer cursor.Close(context.TODO())

	var presets []models.Preset
	if err := cursor.All(context.TODO(), &presets); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode presets"})
		return
	}

	out := make([]gin.H, 0, len(presets))
	for _, p := range presets {
		item := gin.H{
			"id": p.ID.Hex(), "name": p.Name, "parameters": p.Parameters, "isPublic": p.IsPublic,
		}
		if !p.UserID.IsZero() {
			item["userId"] = p.UserID.Hex()
		}
		out = append(out, item)
	}
	c.JSON(http.StatusOK, out)
}

func (h *PresetHandler) CreatePreset(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req struct {
		Name       string         `json:"name" binding:"required"`
		Parameters map[string]any `json:"parameters" binding:"required"`
		IsPublic   bool           `json:"isPublic"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	preset := models.Preset{
		UserID:     userID.(primitive.ObjectID),
		Name:       strings.TrimSpace(req.Name),
		Parameters: req.Parameters,
		IsPublic:   req.IsPublic,
		CreatedAt:  time.Now(),
	}
	result, err := h.db.Presets().InsertOne(context.TODO(), preset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save preset"})
		return
	}
	preset.ID = result.InsertedID.(primitive.ObjectID)
	c.JSON(http.StatusCreated, gin.H{
		"id": preset.ID.Hex(), "name": preset.Name, "parameters": preset.Parameters, "isPublic": preset.IsPublic,
	})
}

func (h *PresetHandler) DeletePreset(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid preset ID"})
		return
	}

	result, err := h.db.Presets().DeleteOne(context.TODO(), bson.M{"_id": id, "userId": userID.(primitive.ObjectID)})
	if err != nil || result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Preset not found or not owned by you"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Preset deleted"})
}
