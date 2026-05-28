package handlers

import (
	"context"
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
	"go.mongodb.org/mongo-driver/mongo/options"
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

type feedEvent struct {
	Type      string    `json:"type"`
	CreatedAt time.Time `json:"createdAt"`
	ActorID   string    `json:"actorId,omitempty"`
	Actor     string    `json:"actor,omitempty"`
	TargetID  string    `json:"targetId,omitempty"`
	Target    string    `json:"target,omitempty"`
	ArtworkID string    `json:"artworkId,omitempty"`
	Artwork   string    `json:"artwork,omitempty"`
	Message   string    `json:"message"`
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

// GetActivityFeed returns recent public social events across the platform.
func (h *DiscoveryHandler) GetActivityFeed(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	if limit < 1 {
		limit = 30
	}
	if limit > 80 {
		limit = 80
	}

	fetchLimit := int64(limit * 3)
	ctx := context.TODO()
	events := make([]feedEvent, 0, limit*4)

	userNames := map[primitive.ObjectID]string{}
	artTitles := map[primitive.ObjectID]string{}
	resolveUser := func(id primitive.ObjectID) string {
		if id.IsZero() {
			return ""
		}
		if name, ok := userNames[id]; ok {
			return name
		}
		var u models.User
		if err := h.db.Users().FindOne(ctx, bson.M{"_id": id}).Decode(&u); err == nil {
			userNames[id] = u.Username
			return u.Username
		}
		userNames[id] = ""
		return ""
	}
	resolveArtwork := func(id primitive.ObjectID) (string, bool) {
		if id.IsZero() {
			return "", false
		}
		if title, ok := artTitles[id]; ok {
			return title, title != ""
		}
		var a models.Artwork
		err := h.db.Artworks().FindOne(ctx, bson.M{"_id": id, "isPublic": true}).Decode(&a)
		if err != nil {
			artTitles[id] = ""
			return "", false
		}
		artTitles[id] = a.Title
		return a.Title, true
	}

	// New public artworks
	{
		cursor, err := h.db.Artworks().Find(ctx, bson.M{"isPublic": true}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(fetchLimit))
		if err == nil {
			var items []models.Artwork
			if cursor.All(ctx, &items) == nil {
				for _, a := range items {
					actor := resolveUser(a.UserID)
					events = append(events, feedEvent{
						Type:      "artwork",
						CreatedAt: a.CreatedAt,
						ActorID:   a.UserID.Hex(),
						Actor:     actor,
						ArtworkID: a.ID.Hex(),
						Artwork:   a.Title,
						Message:   "published new artwork",
					})
				}
			}
			_ = cursor.Close(ctx)
		}
	}

	// Likes on public artworks
	{
		cursor, err := h.db.Likes().Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(fetchLimit))
		if err == nil {
			var items []models.Like
			if cursor.All(ctx, &items) == nil {
				for _, l := range items {
					title, ok := resolveArtwork(l.ArtworkID)
					if !ok {
						continue
					}
					actor := resolveUser(l.UserID)
					events = append(events, feedEvent{
						Type:      "like",
						CreatedAt: l.CreatedAt,
						ActorID:   l.UserID.Hex(),
						Actor:     actor,
						ArtworkID: l.ArtworkID.Hex(),
						Artwork:   title,
						Message:   "liked artwork",
					})
				}
			}
			_ = cursor.Close(ctx)
		}
	}

	// Root comments on public artworks
	{
		cursor, err := h.db.Comments().Find(ctx, bson.M{"parentId": bson.M{"$exists": false}}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(fetchLimit))
		if err == nil {
			var items []models.Comment
			if cursor.All(ctx, &items) == nil {
				for _, m := range items {
					title, ok := resolveArtwork(m.ArtworkID)
					if !ok {
						continue
					}
					actor := resolveUser(m.UserID)
					events = append(events, feedEvent{
						Type:      "comment",
						CreatedAt: m.CreatedAt,
						ActorID:   m.UserID.Hex(),
						Actor:     actor,
						ArtworkID: m.ArtworkID.Hex(),
						Artwork:   title,
						Message:   "commented on artwork",
					})
				}
			}
			_ = cursor.Close(ctx)
		}
	}

	// Follow events
	{
		cursor, err := h.db.Follows().Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(fetchLimit))
		if err == nil {
			var items []models.Follow
			if cursor.All(ctx, &items) == nil {
				for _, f := range items {
					actor := resolveUser(f.FollowerID)
					target := resolveUser(f.FolloweeID)
					if actor == "" || target == "" {
						continue
					}
					events = append(events, feedEvent{
						Type:      "follow",
						CreatedAt: f.CreatedAt,
						ActorID:   f.FollowerID.Hex(),
						Actor:     actor,
						TargetID:  f.FolloweeID.Hex(),
						Target:    target,
						Message:   "started following",
					})
				}
			}
			_ = cursor.Close(ctx)
		}
	}

	sort.Slice(events, func(i, j int) bool {
		return events[i].CreatedAt.After(events[j].CreatedAt)
	})
	if len(events) > limit {
		events = events[:limit]
	}

	c.JSON(http.StatusOK, events)
}
