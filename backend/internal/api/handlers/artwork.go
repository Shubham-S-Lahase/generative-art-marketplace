package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/cloudinary"
	"generative-art-marketplace/pkg/database"
	"generative-art-marketplace/pkg/generator"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ArtworkHandler struct {
	db         *database.MongoDB
	cfg        *config.Config
	cloudinary *cloudinary.Service
}

func NewArtworkHandler(db *database.MongoDB, cfg *config.Config, cloudinaryService *cloudinary.Service) *ArtworkHandler {
	return &ArtworkHandler{db: db, cfg: cfg, cloudinary: cloudinaryService}
}

// ArtworkWithUser extends Artwork with username
type ArtworkWithUser struct {
	models.Artwork
	Username string `json:"username"`
}

// populateUsernames adds username to artworks by looking up users
func (h *ArtworkHandler) populateUsernames(artworks []models.Artwork) []ArtworkWithUser {
	result := make([]ArtworkWithUser, len(artworks))
	for i, artwork := range artworks {
		result[i] = ArtworkWithUser{
			Artwork: artwork,
		}
		// Fetch user to get username
		var user models.User
		if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": artwork.UserID}).Decode(&user); err == nil {
			result[i].Username = user.Username
		}
	}
	return result
}

func (h *ArtworkHandler) GetArtworks(c *gin.Context) {
	// Parse query parameters
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	category := c.Query("category")
	sortBy := c.DefaultQuery("sort", "recent")
	user := c.Query("userId")
	priceMin, _ := strconv.ParseFloat(c.DefaultQuery("priceMin", "0"), 64)
	priceMax, _ := strconv.ParseFloat(c.DefaultQuery("priceMax", "0"), 64)
	forSale := c.Query("forSale")
	license := c.Query("license")

	// Build filter
	filter := bson.M{"isPublic": true}
	if category != "" && category != "all" {
		filter["category"] = category
	}
	if user != "" {
		if uid, err := primitive.ObjectIDFromHex(user); err == nil {
			filter["userId"] = uid
		}
	}
	if forSale == "true" {
		filter["marketplace.forSale"] = true
	}
	if priceMin > 0 {
		filter["marketplace.price"] = bson.M{"$gte": priceMin}
	}
	if priceMax > 0 {
		if existing, ok := filter["marketplace.price"].(bson.M); ok {
			existing["$lte"] = priceMax
			filter["marketplace.price"] = existing
		} else {
			filter["marketplace.price"] = bson.M{"$lte": priceMax}
		}
	}
	if license != "" && license != "all" {
		filter["marketplace.licensing"] = license
	}

	// Build sort
	sort := bson.M{}
	switch sortBy {
	case "popular":
		sort["metrics.views"] = -1
	case "likes":
		sort["metrics.likes"] = -1
	case "price-asc":
		sort["marketplace.price"] = 1
	case "price-desc":
		sort["marketplace.price"] = -1
	case "recent":
	default:
		sort["createdAt"] = -1
	}

	// Calculate skip
	skip := (page - 1) * limit

	// Query options
	opts := options.Find()
	opts.SetSort(sort)
	opts.SetLimit(int64(limit))
	opts.SetSkip(int64(skip))

	cursor, err := h.db.Artworks().Find(context.TODO(), filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch artworks"})
		return
	}
	defer cursor.Close(context.TODO())

	var artworks []models.Artwork
	if err = cursor.All(context.TODO(), &artworks); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode artworks"})
		return
	}

	// Populate username for each artwork
	result := h.populateUsernames(artworks)
	c.JSON(http.StatusOK, result)
}

func (h *ArtworkHandler) GetArtwork(c *gin.Context) {
	id := c.Param("id")
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	var artwork models.Artwork
	err = h.db.Artworks().FindOne(context.TODO(), bson.M{"_id": objectID}).Decode(&artwork)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Artwork not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Populate username (view count is incremented via POST /artworks/:id/view)
	result := h.populateUsernames([]models.Artwork{artwork})[0]
	c.JSON(http.StatusOK, result)
}

// RecordArtworkView increments views once per viewer per artwork (per browser session on client).
func (h *ArtworkHandler) RecordArtworkView(c *gin.Context) {
	objectID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	var artwork models.Artwork
	if err := h.db.Artworks().FindOne(context.TODO(), bson.M{"_id": objectID}).Decode(&artwork); err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Artwork not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	viewerKey := h.viewerKey(c)
	result, err := h.db.ArtworkViews().UpdateOne(
		context.TODO(),
		bson.M{"artworkId": objectID, "viewerKey": viewerKey},
		bson.M{"$setOnInsert": bson.M{
			"artworkId": objectID,
			"viewerKey": viewerKey,
			"createdAt": time.Now(),
		}},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record view"})
		return
	}

	counted := result.UpsertedCount > 0
	if counted {
		_, _ = h.db.Artworks().UpdateOne(
			context.TODO(),
			bson.M{"_id": objectID},
			bson.M{"$inc": bson.M{"metrics.views": 1}},
		)
		artwork.Metrics.Views++
	}

	c.JSON(http.StatusOK, gin.H{
		"views":   artwork.Metrics.Views,
		"counted": counted,
	})
}

func (h *ArtworkHandler) viewerKey(c *gin.Context) string {
	if userID, ok := c.Get("userID"); ok {
		return "user:" + userID.(primitive.ObjectID).Hex()
	}
	return "ip:" + c.ClientIP()
}

// GeneratePreview renders server-side art without persisting to DB.
func (h *ArtworkHandler) GeneratePreview(c *gin.Context) {
	var req models.GeneratePreviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Parameters == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "parameters are required"})
		return
	}

	imgPath, err := h.persistImage(models.CreateArtworkRequest{
		Title:      "preview",
		Parameters: req.Parameters,
		ImageData:  req.ImageData,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"previewUrl": imgPath})
}

func (h *ArtworkHandler) CreateArtwork(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req models.CreateArtworkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	imagePath, err := h.persistImage(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to persist image: " + err.Error()})
		return
	}

	artwork := models.Artwork{
		Title:       req.Title,
		Description: req.Description,
		UserID:      userID.(primitive.ObjectID),
		Parameters:  req.Parameters,
		Tags:        req.Tags,
		IsPublic:    req.IsPublic,
		Marketplace: req.Marketplace,
		IsFeatured:  false,
		IsVerified:  false,
		ImageURL:    imagePath,
		PreviewURL:  imagePath,
		Metrics: models.ArtworkMetrics{
			Views:     0,
			Likes:     0,
			Comments:  0,
			Bookmarks: 0,
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	result, err := h.db.Artworks().InsertOne(context.TODO(), artwork)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create artwork"})
		return
	}

	artwork.ID = result.InsertedID.(primitive.ObjectID)
	c.JSON(http.StatusCreated, artwork)
}

func (h *ArtworkHandler) persistImage(req models.CreateArtworkRequest) (string, error) {
	ctx := context.Background()
	
	if h.cloudinary == nil {
		return "", fmt.Errorf("Cloudinary service is not initialized")
	}
	
		var imageData []byte
		var err error

		if strings.TrimSpace(req.ImageData) != "" {
			// Decode base64 image data
			imageData, err = generator.DecodeBase64ToBytes(req.ImageData)
			if err != nil {
				return "", err
			}
		} else {
			// Generate image server-side
			params := generator.Params{
				Colors:     extractColors(req.Parameters),
				Pattern:    getString(req.Parameters, "pattern", "random"),
				Complexity: getInt(req.Parameters, "complexity", 5),
				Seed:       int64(getInt(req.Parameters, "seed", int(time.Now().Unix()))),
			}
			imageData, err = generator.GeneratePNGBytes(params)
			if err != nil {
				return "", err
			}
		}

		// Upload to Cloudinary
		imageURL, err := h.cloudinary.UploadImage(ctx, imageData, "artworks")
		if err != nil {
			return "", err
		}
		return imageURL, nil
}

func extractColors(params map[string]any) []string {
	val, ok := params["colors"]
	if !ok {
		return []string{"#000000", "#ffffff"}
	}
	var colors []string
	switch v := val.(type) {
	case []string:
		colors = v
	case []any:
		for _, c := range v {
			if s, ok := c.(string); ok {
				colors = append(colors, s)
			}
		}
	}
	if len(colors) == 0 {
		return []string{"#000000", "#ffffff"}
	}
	return colors
}

func getString(m map[string]any, key, fallback string) string {
	if val, ok := m[key]; ok {
		if s, ok := val.(string); ok && s != "" {
			return s
		}
	}
	return fallback
}

func getInt(m map[string]any, key string, fallback int) int {
	if val, ok := m[key]; ok {
		switch v := val.(type) {
		case int:
			return v
		case int32:
			return int(v)
		case int64:
			return int(v)
		case float64:
			return int(v)
		}
	}
	return fallback
}

func (h *ArtworkHandler) UpdateArtwork(c *gin.Context) {
	id := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	// Check if user owns the artwork
	var artwork models.Artwork
	err = h.db.Artworks().FindOne(context.TODO(), bson.M{
		"_id":    objectID,
		"userId": userID,
	}).Decode(&artwork)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Artwork not found or not owned by user"})
		return
	}

	var req models.CreateArtworkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	update := bson.M{
		"$set": bson.M{
			"title":       req.Title,
			"description": req.Description,
			"parameters":  req.Parameters,
			"tags":        req.Tags,
			"isPublic":    req.IsPublic,
			"marketplace": req.Marketplace,
			"updatedAt":   time.Now(),
		},
	}

	_, err = h.db.Artworks().UpdateOne(context.TODO(), bson.M{"_id": objectID}, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update artwork"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Artwork updated successfully"})
}

func (h *ArtworkHandler) DeleteArtwork(c *gin.Context) {
	id := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	// Delete artwork (only if user owns it)
	result, err := h.db.Artworks().DeleteOne(context.TODO(), bson.M{
		"_id":    objectID,
		"userId": userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete artwork"})
		return
	}

	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Artwork not found or not owned by user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Artwork deleted successfully"})
}

func (h *ArtworkHandler) LikeArtwork(c *gin.Context) {
	id := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	// Check if already liked
	count, err := h.db.Likes().CountDocuments(context.TODO(), bson.M{
		"artworkId": objectID,
		"userId":    userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Already liked"})
		return
	}

	// Create like record
	like := bson.M{
		"artworkId": objectID,
		"userId":    userID,
		"createdAt": time.Now(),
	}

	_, err = h.db.Likes().InsertOne(context.TODO(), like)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to like artwork"})
		return
	}

	// Increment like count
	_, err = h.db.Artworks().UpdateOne(
		context.TODO(),
		bson.M{"_id": objectID},
		bson.M{"$inc": bson.M{"metrics.likes": 1}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update like count"})
		return
	}

	// Notify owner
	var art models.Artwork
	if err := h.db.Artworks().FindOne(context.TODO(), bson.M{"_id": objectID}).Decode(&art); err == nil {
		if art.UserID != userID.(primitive.ObjectID) {
			src := objectID
			createNotification(h.db, art.UserID, "like", "New like", "Someone liked your artwork: "+art.Title, &src)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Artwork liked successfully"})
}

func (h *ArtworkHandler) UnlikeArtwork(c *gin.Context) {
	id := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	// Delete like record
	result, err := h.db.Likes().DeleteOne(context.TODO(), bson.M{
		"artworkId": objectID,
		"userId":    userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unlike artwork"})
		return
	}

	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Like not found"})
		return
	}

	// Decrement like count
	_, err = h.db.Artworks().UpdateOne(
		context.TODO(),
		bson.M{"_id": objectID},
		bson.M{"$inc": bson.M{"metrics.likes": -1}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update like count"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Artwork unliked successfully"})
}

func (h *ArtworkHandler) GetFeaturedArtworks(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	opts := options.Find()
	opts.SetLimit(int64(limit))
	opts.SetSort(bson.M{"createdAt": -1})

	cursor, err := h.db.Artworks().Find(context.TODO(), bson.M{
		"isPublic":   true,
		"isFeatured": true,
	}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch featured artworks"})
		return
	}
	defer cursor.Close(context.TODO())

	var artworks []models.Artwork
	if err = cursor.All(context.TODO(), &artworks); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode artworks"})
		return
	}

	// Populate username for each artwork
	result := h.populateUsernames(artworks)
	c.JSON(http.StatusOK, result)
}

func (h *ArtworkHandler) GetTrendingArtworks(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	opts := options.Find()
	opts.SetLimit(int64(limit))
	opts.SetSort(bson.M{"metrics.views": -1})

	cursor, err := h.db.Artworks().Find(context.TODO(), bson.M{
		"isPublic": true,
	}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch trending artworks"})
		return
	}
	defer cursor.Close(context.TODO())

	var artworks []models.Artwork
	if err = cursor.All(context.TODO(), &artworks); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode artworks"})
		return
	}

	// Populate username for each artwork
	result := h.populateUsernames(artworks)
	c.JSON(http.StatusOK, result)
}

func (h *ArtworkHandler) SearchArtworks(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Search query required"})
		return
	}

	// Simple text search (in production, use MongoDB text search or Atlas Search)
	filter := bson.M{
		"isPublic": true,
		"$or": []bson.M{
			{"title": bson.M{"$regex": query, "$options": "i"}},
			{"description": bson.M{"$regex": query, "$options": "i"}},
			{"tags": bson.M{"$in": []string{query}}},
		},
	}

	cursor, err := h.db.Artworks().Find(context.TODO(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}
	defer cursor.Close(context.TODO())

	var artworks []models.Artwork
	if err = cursor.All(context.TODO(), &artworks); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode search results"})
		return
	}

	// Populate username for each artwork
	result := h.populateUsernames(artworks)
	c.JSON(http.StatusOK, result)
}

func (h *ArtworkHandler) GetComments(c *gin.Context) {
	artworkID := c.Param("id")
	objectID, err := primitive.ObjectIDFromHex(artworkID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	cursor, err := h.db.Comments().Find(context.TODO(), bson.M{"artworkId": objectID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments"})
		return
	}
	defer cursor.Close(context.TODO())

	var comments []models.Comment
	if err = cursor.All(context.TODO(), &comments); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode comments"})
		return
	}

	likeCounts, userLiked := h.commentLikeStats(objectID, comments, c)

	result := make([]bson.M, len(comments))
	for i, comment := range comments {
		item := bson.M{
			"_id":       comment.ID,
			"artworkId": comment.ArtworkID,
			"userId":    comment.UserID,
			"text":      comment.Text,
			"createdAt": comment.CreatedAt,
			"likes":     likeCounts[comment.ID],
			"liked":     userLiked[comment.ID],
		}
		if comment.ParentID != nil {
			item["parentId"] = *comment.ParentID
		}
		if !comment.UpdatedAt.IsZero() {
			item["updatedAt"] = comment.UpdatedAt
		}

		var user models.User
		if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": comment.UserID}).Decode(&user); err == nil {
			item["username"] = user.Username
		}
		result[i] = item
	}

	c.JSON(http.StatusOK, result)
}

func (h *ArtworkHandler) AddComment(c *gin.Context) {
	artworkID := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objectID, err := primitive.ObjectIDFromHex(artworkID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	var req struct {
		Text     string `json:"text" binding:"required"`
		ParentID string `json:"parentId"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	comment := bson.M{
		"artworkId": objectID,
		"userId":    userID,
		"text":      strings.TrimSpace(req.Text),
		"createdAt": now,
		"updatedAt": now,
	}

	if req.ParentID != "" {
		parentObjectID, err := primitive.ObjectIDFromHex(req.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent comment ID"})
			return
		}
		var parent models.Comment
		if err := h.db.Comments().FindOne(context.TODO(), bson.M{
			"_id":       parentObjectID,
			"artworkId": objectID,
		}).Decode(&parent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent comment not found"})
			return
		}
		comment["parentId"] = parentObjectID
	}

	insertResult, err := h.db.Comments().InsertOne(context.TODO(), comment)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add comment"})
		return
	}

	h.db.Artworks().UpdateOne(
		context.TODO(),
		bson.M{"_id": objectID},
		bson.M{"$inc": bson.M{"metrics.comments": 1}},
	)

	var art models.Artwork
	if err := h.db.Artworks().FindOne(context.TODO(), bson.M{"_id": objectID}).Decode(&art); err == nil {
		uid := userID.(primitive.ObjectID)
		if art.UserID != uid {
			src := objectID
			createNotification(h.db, art.UserID, "comment", "New comment", "Someone commented on your artwork: "+art.Title, &src)
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Comment added successfully",
		"id":      insertResult.InsertedID,
	})
}

func (h *ArtworkHandler) UpdateComment(c *gin.Context) {
	artworkID := c.Param("id")
	commentID := c.Param("commentId")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	artworkObjectID, err := primitive.ObjectIDFromHex(artworkID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	commentObjectID, err := primitive.ObjectIDFromHex(commentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	var req struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Comment text cannot be empty"})
		return
	}

	result, err := h.db.Comments().UpdateOne(context.TODO(), bson.M{
		"_id":       commentObjectID,
		"artworkId": artworkObjectID,
		"userId":    userID,
	}, bson.M{
		"$set": bson.M{
			"text":      text,
			"updatedAt": time.Now(),
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update comment"})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found or not owned by user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment updated successfully"})
}

func (h *ArtworkHandler) DeleteComment(c *gin.Context) {
	artworkID := c.Param("id")
	commentID := c.Param("commentId")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	artworkObjectID, err := primitive.ObjectIDFromHex(artworkID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	commentObjectID, err := primitive.ObjectIDFromHex(commentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	var root models.Comment
	if err := h.db.Comments().FindOne(context.TODO(), bson.M{
		"_id":       commentObjectID,
		"artworkId": artworkObjectID,
		"userId":    userID,
	}).Decode(&root); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found or not owned by user"})
		return
	}

	cursor, err := h.db.Comments().Find(context.TODO(), bson.M{"artworkId": artworkObjectID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments"})
		return
	}
	defer cursor.Close(context.TODO())

	var allComments []models.Comment
	if err = cursor.All(context.TODO(), &allComments); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode comments"})
		return
	}

	idsToDelete := append([]primitive.ObjectID{commentObjectID}, collectCommentDescendants(allComments, commentObjectID)...)

	_, err = h.db.Comments().DeleteMany(context.TODO(), bson.M{"_id": bson.M{"$in": idsToDelete}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete comment"})
		return
	}

	_, _ = h.db.CommentLikes().DeleteMany(context.TODO(), bson.M{"commentId": bson.M{"$in": idsToDelete}})

	h.db.Artworks().UpdateOne(
		context.TODO(),
		bson.M{"_id": artworkObjectID},
		bson.M{"$inc": bson.M{"metrics.comments": -int64(len(idsToDelete))}},
	)

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted successfully", "deletedCount": len(idsToDelete)})
}

func (h *ArtworkHandler) LikeComment(c *gin.Context) {
	artworkObjectID, commentObjectID, userID, ok := h.parseCommentRouteIDs(c)
	if !ok {
		return
	}

	count, err := h.db.CommentLikes().CountDocuments(context.TODO(), bson.M{
		"commentId": commentObjectID,
		"userId":    userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Already liked"})
		return
	}

	_, err = h.db.CommentLikes().InsertOne(context.TODO(), bson.M{
		"commentId": commentObjectID,
		"artworkId": artworkObjectID,
		"userId":    userID,
		"createdAt": time.Now(),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to like comment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment liked successfully"})
}

func (h *ArtworkHandler) UnlikeComment(c *gin.Context) {
	artworkObjectID, commentObjectID, userID, ok := h.parseCommentRouteIDs(c)
	if !ok {
		return
	}

	result, err := h.db.CommentLikes().DeleteOne(context.TODO(), bson.M{
		"commentId": commentObjectID,
		"artworkId": artworkObjectID,
		"userId":    userID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unlike comment"})
		return
	}
	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Like not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment unliked successfully"})
}

func (h *ArtworkHandler) parseCommentRouteIDs(c *gin.Context) (primitive.ObjectID, primitive.ObjectID, primitive.ObjectID, bool) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return primitive.NilObjectID, primitive.NilObjectID, primitive.NilObjectID, false
	}

	artworkObjectID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return primitive.NilObjectID, primitive.NilObjectID, primitive.NilObjectID, false
	}

	commentObjectID, err := primitive.ObjectIDFromHex(c.Param("commentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return primitive.NilObjectID, primitive.NilObjectID, primitive.NilObjectID, false
	}

	var comment models.Comment
	if err := h.db.Comments().FindOne(context.TODO(), bson.M{
		"_id":       commentObjectID,
		"artworkId": artworkObjectID,
	}).Decode(&comment); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return primitive.NilObjectID, primitive.NilObjectID, primitive.NilObjectID, false
	}

	return artworkObjectID, commentObjectID, userIDVal.(primitive.ObjectID), true
}

func (h *ArtworkHandler) commentLikeStats(artworkID primitive.ObjectID, comments []models.Comment, c *gin.Context) (map[primitive.ObjectID]int64, map[primitive.ObjectID]bool) {
	likeCounts := make(map[primitive.ObjectID]int64)
	userLiked := make(map[primitive.ObjectID]bool)
	if len(comments) == 0 {
		return likeCounts, userLiked
	}

	commentIDs := make([]primitive.ObjectID, len(comments))
	for i, comment := range comments {
		commentIDs[i] = comment.ID
		likeCounts[comment.ID] = 0
		userLiked[comment.ID] = false
	}

	cursor, err := h.db.CommentLikes().Find(context.TODO(), bson.M{
		"artworkId": artworkID,
		"commentId": bson.M{"$in": commentIDs},
	})
	if err != nil {
		return likeCounts, userLiked
	}
	defer cursor.Close(context.TODO())

	var currentUserID *primitive.ObjectID
	if userIDVal, ok := c.Get("userID"); ok {
		uid := userIDVal.(primitive.ObjectID)
		currentUserID = &uid
	}

	var likes []models.CommentLike
	if err = cursor.All(context.TODO(), &likes); err != nil {
		return likeCounts, userLiked
	}

	for _, like := range likes {
		likeCounts[like.CommentID]++
		if currentUserID != nil && like.UserID == *currentUserID {
			userLiked[like.CommentID] = true
		}
	}

	return likeCounts, userLiked
}

func collectCommentDescendants(comments []models.Comment, parentID primitive.ObjectID) []primitive.ObjectID {
	var ids []primitive.ObjectID
	for _, comment := range comments {
		if comment.ParentID != nil && *comment.ParentID == parentID {
			ids = append(ids, comment.ID)
			ids = append(ids, collectCommentDescendants(comments, comment.ID)...)
		}
	}
	return ids
}

// BookmarkArtwork adds a bookmark for the current user.
func (h *ArtworkHandler) BookmarkArtwork(c *gin.Context) {
	artworkID := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	objectID, err := primitive.ObjectIDFromHex(artworkID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	_, err = h.db.Bookmarks().UpdateOne(
		context.TODO(),
		bson.M{"artworkId": objectID, "userId": userID},
		bson.M{"$setOnInsert": bson.M{"artworkId": objectID, "userId": userID, "createdAt": time.Now()}},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to bookmark"})
		return
	}

	h.db.Artworks().UpdateOne(context.TODO(), bson.M{"_id": objectID}, bson.M{"$inc": bson.M{"metrics.bookmarks": 1}})

	c.JSON(http.StatusOK, gin.H{"message": "Bookmarked"})
}

// UnbookmarkArtwork removes a bookmark for the current user.
func (h *ArtworkHandler) UnbookmarkArtwork(c *gin.Context) {
	artworkID := c.Param("id")
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	objectID, err := primitive.ObjectIDFromHex(artworkID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return
	}

	result, err := h.db.Bookmarks().DeleteOne(context.TODO(), bson.M{"artworkId": objectID, "userId": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unbookmark"})
		return
	}
	if result.DeletedCount > 0 {
		h.db.Artworks().UpdateOne(context.TODO(), bson.M{"_id": objectID}, bson.M{"$inc": bson.M{"metrics.bookmarks": -1}})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Removed bookmark"})
}
