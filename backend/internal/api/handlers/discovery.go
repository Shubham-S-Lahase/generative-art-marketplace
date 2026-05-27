package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DiscoveryHandler struct {
	db *database.MongoDB
}

func NewDiscoveryHandler(db *database.MongoDB) *DiscoveryHandler {
	return &DiscoveryHandler{db: db}
}

type tagCount struct {
	Tag   string `json:"tag" bson:"_id"`
	Count int64  `json:"count" bson:"count"`
}

type searchCount struct {
	Query string `json:"query" bson:"_id"`
	Count int64  `json:"count" bson:"count"`
}

// GetTrendingTags returns the most-used tags on public artworks.
func (h *DiscoveryHandler) GetTrendingTags(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "12"))
	if limit < 1 {
		limit = 12
	}
	if limit > 30 {
		limit = 30
	}

	pipeline := []bson.M{
		{"$match": bson.M{"isPublic": true, "tags.0": bson.M{"$exists": true}}},
		{"$unwind": "$tags"},
		{"$group": bson.M{
			"_id":   bson.M{"$toLower": "$tags"},
			"count": bson.M{"$sum": 1},
		}},
		{"$sort": bson.M{"count": -1}},
		{"$limit": limit},
	}

	cursor, err := h.db.Artworks().Aggregate(context.TODO(), pipeline)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load trending tags"})
		return
	}
	defer cursor.Close(context.TODO())

	var results []tagCount
	if err := cursor.All(context.TODO(), &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode trending tags"})
		return
	}

	out := make([]gin.H, 0, len(results))
	for _, r := range results {
		tag := strings.TrimSpace(r.Tag)
		if tag == "" {
			continue
		}
		out = append(out, gin.H{"tag": tag, "count": r.Count})
	}
	c.JSON(http.StatusOK, out)
}

// GetPopularSearches returns frequently logged search queries.
func (h *DiscoveryHandler) GetPopularSearches(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "8"))
	if limit < 1 {
		limit = 8
	}
	if limit > 20 {
		limit = 20
	}

	pipeline := []bson.M{
		{"$group": bson.M{
			"_id":   bson.M{"$toLower": "$query"},
			"count": bson.M{"$sum": 1},
		}},
		{"$sort": bson.M{"count": -1}},
		{"$limit": limit},
	}

	cursor, err := h.db.SearchLogs().Aggregate(context.TODO(), pipeline)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load popular searches"})
		return
	}
	defer cursor.Close(context.TODO())

	var results []searchCount
	if err := cursor.All(context.TODO(), &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode popular searches"})
		return
	}

	out := make([]gin.H, 0, len(results))
	for _, r := range results {
		q := strings.TrimSpace(r.Query)
		if q == "" || len(q) < 2 {
			continue
		}
		out = append(out, gin.H{"query": q, "count": r.Count})
	}
	c.JSON(http.StatusOK, out)
}

type recordSearchRequest struct {
	Query    string `json:"query"`
	Tags     string `json:"tags"`
	Category string `json:"category"`
}

// RecordSearch logs a search for popular-search aggregation.
func (h *DiscoveryHandler) RecordSearch(c *gin.Context) {
	var req recordSearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	query := strings.TrimSpace(req.Query)
	if query == "" && strings.TrimSpace(req.Tags) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "query or tags required"})
		return
	}
	if query == "" {
		query = strings.TrimSpace(req.Tags)
	}
	if len(query) < 2 || len(query) > 120 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid query length"})
		return
	}

	entry := models.SearchLog{
		Query:     strings.ToLower(query),
		Tags:      strings.TrimSpace(req.Tags),
		Category:  strings.TrimSpace(req.Category),
		CreatedAt: time.Now(),
	}
	if userID, ok := c.Get("userID"); ok {
		uid := userID.(primitive.ObjectID)
		entry.UserID = &uid
	}

	_, _ = h.db.SearchLogs().InsertOne(context.TODO(), entry)
	c.JSON(http.StatusCreated, gin.H{"ok": true})
}

// LogSearchQuery is called internally when listing artworks with search params.
func (h *DiscoveryHandler) LogSearchQuery(query string) {
	query = strings.TrimSpace(strings.ToLower(query))
	if len(query) < 2 {
		return
	}
	_, _ = h.db.SearchLogs().InsertOne(context.TODO(), models.SearchLog{
		Query:     query,
		CreatedAt: time.Now(),
	})
}
