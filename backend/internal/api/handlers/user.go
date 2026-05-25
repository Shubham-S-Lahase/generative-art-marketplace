package handlers

import (
	"context"
	"net/http"
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

type UserHandler struct {
	db         *database.MongoDB
	cfg        *config.Config
	cloudinary *cloudinary.Service
}

func NewUserHandler(db *database.MongoDB, cfg *config.Config, cloudinaryService *cloudinary.Service) *UserHandler {
	return &UserHandler{db: db, cfg: cfg, cloudinary: cloudinaryService}
}

func (h *UserHandler) GetUserProfile(c *gin.Context) {
	user, err := h.findUserByUsername(c.Param("username"))
	if err != nil {
		h.handleUserLookupError(c, err)
		return
	}
	c.JSON(http.StatusOK, h.buildProfileResponse(c, user))
}

func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req models.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	update := bson.M{
		"bio":       strings.TrimSpace(req.Bio),
		"location":  strings.TrimSpace(req.Location),
		"website":   strings.TrimSpace(req.Website),
		"updatedAt": time.Now(),
	}

	ctx := context.Background()
	if strings.TrimSpace(req.AvatarData) != "" {
		if h.cloudinary == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Image upload service unavailable"})
			return
		}
		bytes, err := generator.DecodeBase64ToBytes(req.AvatarData)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid avatar image"})
			return
		}
		url, err := h.cloudinary.UploadImage(ctx, bytes, "avatars")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to upload avatar"})
			return
		}
		update["avatarUrl"] = url
	}

	if strings.TrimSpace(req.CoverImageData) != "" {
		if h.cloudinary == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Image upload service unavailable"})
			return
		}
		bytes, err := generator.DecodeBase64ToBytes(req.CoverImageData)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cover image"})
			return
		}
		url, err := h.cloudinary.UploadImage(ctx, bytes, "covers")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to upload cover image"})
			return
		}
		update["coverImageUrl"] = url
	}

	_, err := h.db.Users().UpdateOne(context.TODO(), bson.M{"_id": userID}, bson.M{"$set": update})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	var user models.User
	if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": userID}).Decode(&user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated profile"})
		return
	}

	c.JSON(http.StatusOK, h.buildProfileResponse(c, user))
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

	c.JSON(http.StatusOK, h.buildProfileResponse(c, user))
}

func (h *UserHandler) GetUserArtworks(c *gin.Context) {
	user, err := h.findUserByUsername(c.Param("username"))
	if err != nil {
		h.handleUserLookupError(c, err)
		return
	}

	filter := bson.M{"userId": user.ID}
	if !h.isViewerOwner(c, user.ID) {
		filter["isPublic"] = true
	}

	cursor, err := h.db.Artworks().Find(context.TODO(), filter, options.Find().SetSort(bson.M{"createdAt": -1}))
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

func (h *UserHandler) GetUserLikedArtworks(c *gin.Context) {
	user, err := h.findUserByUsername(c.Param("username"))
	if err != nil {
		h.handleUserLookupError(c, err)
		return
	}

	artworkIDs, err := h.likedArtworkIDsForUser(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch liked artworks"})
		return
	}

	onlyPublic := !h.isViewerOwner(c, user.ID)
	artworks, err := h.fetchArtworksByIDs(artworkIDs, onlyPublic)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load liked artworks"})
		return
	}
	c.JSON(http.StatusOK, artworks)
}

func (h *UserHandler) GetUserCollections(c *gin.Context) {
	user, err := h.findUserByUsername(c.Param("username"))
	if err != nil {
		h.handleUserLookupError(c, err)
		return
	}

	if !h.isViewerOwner(c, user.ID) {
		c.JSON(http.StatusOK, []models.Artwork{})
		return
	}

	artworkIDs, err := h.bookmarkedArtworkIDsForUser(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch collections"})
		return
	}

	artworks, err := h.fetchArtworksByIDs(artworkIDs, false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load collections"})
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

	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(50)
	cursor, err := h.db.Notifications().Find(context.TODO(), bson.M{"userId": userID}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notifications"})
		return
	}
	defer cursor.Close(context.TODO())

	var notifications []models.Notification
	if err = cursor.All(context.TODO(), &notifications); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode notifications"})
		return
	}

	c.JSON(http.StatusOK, formatNotificationsForAPI(notifications))
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
		bson.M{
			"userId": userID,
			"$or": []bson.M{
				{"isRead": false},
				{"isRead": bson.M{"$exists": false}},
			},
		},
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
	totalRevenue := h.sumPurchaseRevenue(artworkIDs)

	stats := gin.H{
		"artworksCreated": artworkCount,
		"totalViews":      viewsSum,
		"totalLikes":      likesCount,
		"totalComments":   commentsCount,
		"followersCount":  followersCount,
		"totalRevenue":    totalRevenue,
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

	chartData := make([]gin.H, 0, len(top))
	for _, art := range top {
		chartData = append(chartData, gin.H{
			"id":    art.ID,
			"title": art.Title,
			"views": art.Metrics.Views,
			"likes": art.Metrics.Likes,
		})
	}

	analytics := gin.H{
		"topArtworks": top,
		"chartData":   chartData,
	}

	c.JSON(http.StatusOK, analytics)
}

func (h *UserHandler) findUserByUsername(username string) (models.User, error) {
	var user models.User
	err := h.db.Users().FindOne(context.TODO(), bson.M{"username": username}).Decode(&user)
	return user, err
}

func (h *UserHandler) handleUserLookupError(c *gin.Context, err error) {
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
}

func (h *UserHandler) isViewerOwner(c *gin.Context, profileUserID primitive.ObjectID) bool {
	viewerID, ok := c.Get("userID")
	if !ok {
		return false
	}
	return viewerID.(primitive.ObjectID) == profileUserID
}

func (h *UserHandler) computeUserStats(userID primitive.ObjectID) gin.H {
	artworkIDs, artworkCount := h.getUserArtworkIDs(userID)
	likesOnArtworks, _ := h.db.Likes().CountDocuments(context.TODO(), bson.M{"artworkId": bson.M{"$in": artworkIDs}})

	var user models.User
	_ = h.db.Users().FindOne(context.TODO(), bson.M{"_id": userID}).Decode(&user)

	return gin.H{
		"artworksCreated": artworkCount,
		"totalViews":      h.sumArtworkMetric(userID, "metrics.views"),
		"totalLikes":      likesOnArtworks,
		"followersCount":  user.FollowersCount,
		"followingCount":  user.FollowingCount,
	}
}

func (h *UserHandler) buildProfileResponse(c *gin.Context, user models.User) gin.H {
	stats := h.computeUserStats(user.ID)

	resp := gin.H{
		"id":             user.ID,
		"username":       user.Username,
		"createdAt":      user.CreatedAt,
		"updatedAt":      user.UpdatedAt,
		"followersCount": user.FollowersCount,
		"followingCount": user.FollowingCount,
		"stats":          stats,
		"profile": gin.H{
			"bio":        user.Bio,
			"avatar":     user.AvatarURL,
			"coverImage": user.CoverImageURL,
			"location":   user.Location,
			"website":    user.Website,
		},
	}

	if viewerID, ok := c.Get("userID"); ok {
		count, _ := h.db.Follows().CountDocuments(context.TODO(), bson.M{
			"followerId": viewerID,
			"followeeId": user.ID,
		})
		resp["isFollowing"] = count > 0
	} else {
		resp["isFollowing"] = false
	}

	if h.isViewerOwner(c, user.ID) {
		resp["email"] = user.Email
	}

	return resp
}

func (h *UserHandler) likedArtworkIDsForUser(userID primitive.ObjectID) ([]primitive.ObjectID, error) {
	cursor, err := h.db.Likes().Find(context.TODO(), bson.M{"userId": userID})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(context.TODO())

	var ids []primitive.ObjectID
	for cursor.Next(context.TODO()) {
		var like models.Like
		if err := cursor.Decode(&like); err == nil {
			ids = append(ids, like.ArtworkID)
		}
	}
	return ids, nil
}

func (h *UserHandler) bookmarkedArtworkIDsForUser(userID primitive.ObjectID) ([]primitive.ObjectID, error) {
	cursor, err := h.db.Bookmarks().Find(context.TODO(), bson.M{"userId": userID}, options.Find().SetSort(bson.M{"createdAt": -1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(context.TODO())

	var ids []primitive.ObjectID
	for cursor.Next(context.TODO()) {
		var bookmark models.Bookmark
		if err := cursor.Decode(&bookmark); err == nil {
			ids = append(ids, bookmark.ArtworkID)
		}
	}
	return ids, nil
}

func (h *UserHandler) fetchArtworksByIDs(ids []primitive.ObjectID, onlyPublic bool) ([]models.Artwork, error) {
	if len(ids) == 0 {
		return []models.Artwork{}, nil
	}

	filter := bson.M{"_id": bson.M{"$in": ids}}
	if onlyPublic {
		filter["isPublic"] = true
	}

	cursor, err := h.db.Artworks().Find(context.TODO(), filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(context.TODO())

	var artworks []models.Artwork
	if err := cursor.All(context.TODO(), &artworks); err != nil {
		return nil, err
	}

	// Preserve bookmark/like order
	byID := make(map[primitive.ObjectID]models.Artwork, len(artworks))
	for _, art := range artworks {
		byID[art.ID] = art
	}
	ordered := make([]models.Artwork, 0, len(ids))
	for _, id := range ids {
		if art, ok := byID[id]; ok {
			ordered = append(ordered, art)
		}
	}
	return ordered, nil
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

func (h *UserHandler) sumPurchaseRevenue(artworkIDs []primitive.ObjectID) float64 {
	if len(artworkIDs) == 0 {
		return 0
	}
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: bson.M{"artworkId": bson.M{"$in": artworkIDs}}}},
		bson.D{{Key: "$group", Value: bson.M{"_id": nil, "total": bson.M{"$sum": "$amount"}}}},
	}
	cursor, err := h.db.Purchases().Aggregate(context.TODO(), pipeline)
	if err != nil {
		return 0
	}
	defer cursor.Close(context.TODO())
	var result []struct {
		Total float64 `bson:"total"`
	}
	if cursor.All(context.TODO(), &result) == nil && len(result) > 0 {
		return result[0].Total
	}
	return 0
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
