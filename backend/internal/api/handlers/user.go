package handlers

import (
	"context"
	"net/http"
	"time"

	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/models"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type UserHandler struct {
	db  *database.MongoDB
	cfg *config.Config
}

func NewUserHandler(db *database.MongoDB, cfg *config.Config) *UserHandler {
	return &UserHandler{db: db, cfg: cfg}
}

func (h *UserHandler) GetUserProfile(c *gin.Context) {
	username := c.Param("username")

	var user models.User
	err := h.db.Users().FindOne(context.TODO(), bson.M{"username": username}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Remove sensitive information
	user.Password = ""

	c.JSON(http.StatusOK, user)
}

// GetMe returns the authenticated user's profile.
func (h *UserHandler) GetMe(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var user models.User
	err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": userID}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	user.Password = ""
	c.JSON(http.StatusOK, user)
}

func (h *UserHandler) GetUserArtworks(c *gin.Context) {
	username := c.Param("username")

	// Find user first
	var user models.User
	err := h.db.Users().FindOne(context.TODO(), bson.M{"username": username}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Get user's artworks
	cursor, err := h.db.Artworks().Find(context.TODO(), bson.M{
		"userId":   user.ID,
		"isPublic": true,
	})
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

	c.JSON(http.StatusOK, artworks)
}

func (h *UserHandler) FollowUser(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	targetUserID := c.Param("id")
	targetObjectID, err := primitive.ObjectIDFromHex(targetUserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Check if already following
	count, err := h.db.Follows().CountDocuments(context.TODO(), bson.M{
		"followerId": userID,
		"followeeId": targetObjectID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Already following"})
		return
	}

	// Create follow record
	follow := bson.M{
		"followerId": userID,
		"followeeId": targetObjectID,
		"createdAt":  time.Now(),
	}

	_, err = h.db.Follows().InsertOne(context.TODO(), follow)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to follow user"})
		return
	}

	// Notify followee
	var followee models.User
	if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": targetObjectID}).Decode(&followee); err == nil {
		if targetObjectID != userID {
			src := targetObjectID
			createNotification(h.db, targetObjectID, "follow", "New follower", "You have a new follower", &src)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "User followed successfully"})
}

func (h *UserHandler) UnfollowUser(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	targetUserID := c.Param("id")
	targetObjectID, err := primitive.ObjectIDFromHex(targetUserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Delete follow record
	result, err := h.db.Follows().DeleteOne(context.TODO(), bson.M{
		"followerId": userID,
		"followeeId": targetObjectID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unfollow user"})
		return
	}

	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Not following this user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User unfollowed successfully"})
}

func (h *UserHandler) GetFollowing(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	cursor, err := h.db.Follows().Find(context.TODO(), bson.M{"followerId": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch following list"})
		return
	}
	defer cursor.Close(context.TODO())

	var follows []bson.M
	if err = cursor.All(context.TODO(), &follows); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode following list"})
		return
	}

	c.JSON(http.StatusOK, follows)
}

func (h *UserHandler) GetFollowers(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	cursor, err := h.db.Follows().Find(context.TODO(), bson.M{"followeeId": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch followers list"})
		return
	}
	defer cursor.Close(context.TODO())

	var follows []bson.M
	if err = cursor.All(context.TODO(), &follows); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode followers list"})
		return
	}

	c.JSON(http.StatusOK, follows)
}

func (h *UserHandler) SearchUsers(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Search query required"})
		return
	}

	filter := bson.M{
		"$or": []bson.M{
			{"username": bson.M{"$regex": query, "$options": "i"}},
			{"profile.firstName": bson.M{"$regex": query, "$options": "i"}},
			{"profile.lastName": bson.M{"$regex": query, "$options": "i"}},
		},
	}

	cursor, err := h.db.Users().Find(context.TODO(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}
	defer cursor.Close(context.TODO())

	var users []models.User
	if err = cursor.All(context.TODO(), &users); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode search results"})
		return
	}

	// Remove passwords from results
	for i := range users {
		users[i].Password = ""
	}

	c.JSON(http.StatusOK, users)
}

func (h *UserHandler) GetNotifications(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	cursor, err := h.db.Notifications().Find(context.TODO(), bson.M{"userId": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notifications"})
		return
	}
	defer cursor.Close(context.TODO())

	var notifications []bson.M
	if err = cursor.All(context.TODO(), &notifications); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode notifications"})
		return
	}

	c.JSON(http.StatusOK, notifications)
}

func (h *UserHandler) MarkNotificationAsRead(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	notificationID := c.Param("id")
	objectID, err := primitive.ObjectIDFromHex(notificationID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid notification ID"})
		return
	}

	_, err = h.db.Notifications().UpdateOne(
		context.TODO(),
		bson.M{"_id": objectID, "userId": userID},
		bson.M{"$set": bson.M{"isRead": true}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark notification as read"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification marked as read"})
}

func (h *UserHandler) MarkAllNotificationsAsRead(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	_, err := h.db.Notifications().UpdateMany(
		context.TODO(),
		bson.M{"userId": userID, "isRead": false},
		bson.M{"$set": bson.M{"isRead": true}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark notifications as read"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "All notifications marked as read"})
}

func (h *UserHandler) GetDashboardStats(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	artworkIDs, artworkCount := h.getUserArtworkIDs(userID.(primitive.ObjectID))

	likesCount, _ := h.db.Likes().CountDocuments(context.TODO(), bson.M{"artworkId": bson.M{"$in": artworkIDs}})
	commentsCount, _ := h.db.Comments().CountDocuments(context.TODO(), bson.M{"artworkId": bson.M{"$in": artworkIDs}})
	followersCount, _ := h.db.Follows().CountDocuments(context.TODO(), bson.M{"followeeId": userID})
	viewsSum := h.sumArtworkMetric(userID.(primitive.ObjectID), "metrics.views")

	stats := gin.H{
		"artworksCreated": artworkCount,
		"totalViews":      viewsSum,
		"totalLikes":      likesCount,
		"totalComments":   commentsCount,
		"followersCount":  followersCount,
	}

	c.JSON(http.StatusOK, stats)
}

func (h *UserHandler) GetAnalytics(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	artworkIDs, _ := h.getUserArtworkIDs(userID.(primitive.ObjectID))

	// Basic analytics: top 5 artworks by views
	cursor, err := h.db.Artworks().Find(context.TODO(), bson.M{"_id": bson.M{"$in": artworkIDs}}, options.Find().SetSort(bson.M{"metrics.views": -1}).SetLimit(5))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load analytics"})
		return
	}
	defer cursor.Close(context.TODO())

	var top []models.Artwork
	_ = cursor.All(context.TODO(), &top)

	analytics := gin.H{
		"topArtworks": top,
	}

	c.JSON(http.StatusOK, analytics)
}

func (h *UserHandler) getUserArtworkIDs(userID primitive.ObjectID) ([]primitive.ObjectID, int64) {
	cursor, err := h.db.Artworks().Find(context.TODO(), bson.M{"userId": userID}, options.Find().SetProjection(bson.M{"_id": 1}))
	if err != nil {
		return []primitive.ObjectID{}, 0
	}
	defer cursor.Close(context.TODO())

	var ids []primitive.ObjectID
	for cursor.Next(context.TODO()) {
		var doc struct {
			ID primitive.ObjectID `bson:"_id"`
		}
		if err := cursor.Decode(&doc); err == nil {
			ids = append(ids, doc.ID)
		}
	}
	return ids, int64(len(ids))
}

func (h *UserHandler) sumArtworkMetric(userID primitive.ObjectID, field string) int64 {
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: bson.M{"userId": userID}}},
		bson.D{{Key: "$group", Value: bson.M{"_id": nil, "total": bson.M{"$sum": "$" + field}}}},
	}
	cursor, err := h.db.Artworks().Aggregate(context.TODO(), pipeline)
	if err != nil {
		return 0
	}
	defer cursor.Close(context.TODO())
	var result []struct {
		Total int64 `bson:"total"`
	}
	if cursor.All(context.TODO(), &result) == nil && len(result) > 0 {
		return result[0].Total
	}
	return 0
}
