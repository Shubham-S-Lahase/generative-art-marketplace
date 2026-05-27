package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Username       string             `bson:"username" json:"username"`
	Email          string             `bson:"email" json:"email"`
	Password       string             `bson:"password,omitempty" json:"-"`
	Bio            string             `bson:"bio,omitempty" json:"bio,omitempty"`
	AvatarURL      string             `bson:"avatarUrl,omitempty" json:"avatarUrl,omitempty"`
	CoverImageURL  string             `bson:"coverImageUrl,omitempty" json:"coverImageUrl,omitempty"`
	Location       string             `bson:"location,omitempty" json:"location,omitempty"`
	Website        string             `bson:"website,omitempty" json:"website,omitempty"`
	Twitter        string             `bson:"twitter,omitempty" json:"twitter,omitempty"`
	Instagram      string             `bson:"instagram,omitempty" json:"instagram,omitempty"`
	NotificationPrefs NotificationPrefs `bson:"notificationPrefs,omitempty" json:"notificationPrefs,omitempty"`
	FollowersCount int64              `bson:"followersCount" json:"followersCount"`
	FollowingCount int64              `bson:"followingCount" json:"followingCount"`
	CreatedAt      time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type NotificationPrefs struct {
	Likes     bool `bson:"likes" json:"likes"`
	Comments  bool `bson:"comments" json:"comments"`
	Follows   bool `bson:"follows" json:"follows"`
	Purchases bool `bson:"purchases" json:"purchases"`
}

func DefaultNotificationPrefs() NotificationPrefs {
	return NotificationPrefs{Likes: true, Comments: true, Follows: true, Purchases: true}
}

type UpdateProfileRequest struct {
	Bio            string `json:"bio"`
	Location       string `json:"location"`
	Website        string `json:"website"`
	Twitter        string `json:"twitter"`
	Instagram      string `json:"instagram"`
	AvatarData     string `json:"avatarData"`
	CoverImageData string `json:"coverImageData"`
}

type UpdateNotificationPrefsRequest struct {
	Likes     *bool `json:"likes"`
	Comments  *bool `json:"comments"`
	Follows   *bool `json:"follows"`
	Purchases *bool `json:"purchases"`
}

type DeleteAccountRequest struct {
	Password string `json:"password" binding:"required"`
}

type ArtworkMetrics struct {
	Views     int64 `bson:"views" json:"views"`
	Likes     int64 `bson:"likes" json:"likes"`
	Comments  int64 `bson:"comments" json:"comments"`
	Bookmarks int64 `bson:"bookmarks" json:"bookmarks"`
}

type MarketplaceInfo struct {
	ForSale       bool     `bson:"forSale" json:"forSale"`
	Price         float64  `bson:"price" json:"price"`
	OriginalPrice float64  `bson:"originalPrice,omitempty" json:"originalPrice,omitempty"`
	Licensing     []string `bson:"licensing,omitempty" json:"licensing,omitempty"`
	Exclusivity   bool     `bson:"exclusivity,omitempty" json:"exclusivity,omitempty"`
	Sales         int64    `bson:"sales,omitempty" json:"sales,omitempty"`
}

type Artwork struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID      primitive.ObjectID `bson:"userId" json:"userId"`
	Title       string             `bson:"title" json:"title"`
	Description string             `bson:"description" json:"description"`
	Parameters  map[string]any     `bson:"parameters" json:"parameters"`
	Tags        []string           `bson:"tags,omitempty" json:"tags,omitempty"`
	ImageURL    string             `bson:"imageUrl,omitempty" json:"imageUrl,omitempty"`
	PreviewURL  string             `bson:"previewUrl,omitempty" json:"previewUrl,omitempty"`
	IsPublic    bool               `bson:"isPublic" json:"isPublic"`
	IsFeatured  bool               `bson:"isFeatured" json:"isFeatured"`
	IsVerified  bool                `bson:"isVerified" json:"isVerified"`
	RemixOfID   *primitive.ObjectID `bson:"remixOf,omitempty" json:"remixOf,omitempty"`
	Category     string   `bson:"category,omitempty" json:"category,omitempty"`
	ColorBuckets []int    `bson:"colorBuckets,omitempty" json:"colorBuckets,omitempty"`
	Metrics      ArtworkMetrics `bson:"metrics" json:"metrics"`
	Marketplace MarketplaceInfo    `bson:"marketplace,omitempty" json:"marketplace,omitempty"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type CreateArtworkRequest struct {
	Title       string          `json:"title" binding:"required"`
	Description string          `json:"description"`
	Parameters  map[string]any  `json:"parameters" binding:"required"`
	Tags        []string        `json:"tags"`
	IsPublic    bool            `json:"isPublic"`
	Category    string          `json:"category"`
	RemixOf     string          `json:"remixOf"`
	ImageData   string          `json:"imageData"` // optional base64 PNG from frontend
	Marketplace MarketplaceInfo `json:"marketplace"`
}

type Preset struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID     primitive.ObjectID `bson:"userId,omitempty" json:"userId,omitempty"`
	Name       string             `bson:"name" json:"name"`
	Parameters map[string]any     `bson:"parameters" json:"parameters"`
	IsPublic   bool               `bson:"isPublic" json:"isPublic"`
	CreatedAt  time.Time          `bson:"createdAt" json:"createdAt"`
}

type Report struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ReporterID  primitive.ObjectID `bson:"reporterId" json:"reporterId"`
	TargetType  string             `bson:"targetType" json:"targetType"`
	TargetID    primitive.ObjectID `bson:"targetId" json:"targetId"`
	Reason      string             `bson:"reason" json:"reason"`
	Details     string             `bson:"details,omitempty" json:"details,omitempty"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}

type PasswordReset struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email     string             `bson:"email" json:"email"`
	Token     string             `bson:"token" json:"token"`
	ExpiresAt time.Time          `bson:"expiresAt" json:"expiresAt"`
	Used      bool               `bson:"used" json:"used"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

// GeneratePreviewRequest is used for server-side preview without saving an artwork.
type GeneratePreviewRequest struct {
	Parameters map[string]any `json:"parameters" binding:"required"`
	ImageData  string         `json:"imageData"`
}

type Like struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	ArtworkID primitive.ObjectID `bson:"artworkId" json:"artworkId"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

// ArtworkView records a unique view per viewer (user id or IP) per artwork.
type ArtworkView struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ArtworkID  primitive.ObjectID `bson:"artworkId" json:"artworkId"`
	ViewerKey  string             `bson:"viewerKey" json:"viewerKey"`
	CreatedAt  time.Time          `bson:"createdAt" json:"createdAt"`
}

type Comment struct {
	ID         primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	UserID     primitive.ObjectID  `bson:"userId" json:"userId"`
	ArtworkID  primitive.ObjectID  `bson:"artworkId" json:"artworkId"`
	Text       string              `bson:"text" json:"text"`
	ParentID   *primitive.ObjectID `bson:"parentId,omitempty" json:"parentId,omitempty"`
	CreatedAt  time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt  time.Time           `bson:"updatedAt,omitempty" json:"updatedAt,omitempty"`
}

type CommentLike struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	CommentID primitive.ObjectID `bson:"commentId" json:"commentId"`
	ArtworkID primitive.ObjectID `bson:"artworkId" json:"artworkId"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

type Follow struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	FollowerID primitive.ObjectID `bson:"followerId" json:"followerId"`
	FolloweeID primitive.ObjectID `bson:"followeeId" json:"followeeId"`
	CreatedAt  time.Time          `bson:"createdAt" json:"createdAt"`
}

type Bookmark struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	ArtworkID primitive.ObjectID `bson:"artworkId" json:"artworkId"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

// SearchLog records search activity for popular-search suggestions.
type SearchLog struct {
	ID        primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	UserID    *primitive.ObjectID `bson:"userId,omitempty" json:"userId,omitempty"`
	Query     string              `bson:"query" json:"query"`
	Tags      string              `bson:"tags,omitempty" json:"tags,omitempty"`
	Category  string              `bson:"category,omitempty" json:"category,omitempty"`
	CreatedAt time.Time           `bson:"createdAt" json:"createdAt"`
}

// SavedSearch stores a user's gallery/marketplace filter preset.
type SavedSearch struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	Name      string             `bson:"name" json:"name"`
	Filters   map[string]any     `bson:"filters" json:"filters"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type CreateSavedSearchRequest struct {
	Name    string         `json:"name" binding:"required"`
	Filters map[string]any `json:"filters" binding:"required"`
}

// RecentlyViewed tracks per-user artwork view history for recommendations UI.
type RecentlyViewed struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	ArtworkID primitive.ObjectID `bson:"artworkId" json:"artworkId"`
	ViewedAt  time.Time          `bson:"viewedAt" json:"viewedAt"`
}

type Notification struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	Type      string             `bson:"type" json:"type"`
	Title     string             `bson:"title" json:"title"`
	Message   string             `bson:"message" json:"message"`
	SourceID  *primitive.ObjectID `bson:"sourceId,omitempty" json:"sourceId,omitempty"`
	IsRead    bool               `bson:"isRead" json:"isRead"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

type SessionParticipant struct {
	UserID   primitive.ObjectID `bson:"userId" json:"userId"`
	Username string             `bson:"username" json:"username"`
	Role     string             `bson:"role" json:"role"`
	JoinedAt time.Time          `bson:"joinedAt" json:"joinedAt"`
}

type Session struct {
	ID               primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	Name             string               `bson:"name" json:"name"`
	Description      string               `bson:"description" json:"description"`
	HostID           primitive.ObjectID   `bson:"hostId" json:"hostId"`
	Participants     []SessionParticipant `bson:"participants" json:"participants"`
	MaxParticipants  int                  `bson:"maxParticipants" json:"maxParticipants"`
	IsPublic         bool                 `bson:"isPublic" json:"isPublic"`
	IsActive         bool                 `bson:"isActive" json:"isActive"`
	CurrentParameters map[string]any      `bson:"currentParameters,omitempty" json:"currentParameters,omitempty"`
	CreatedAt        time.Time            `bson:"createdAt" json:"createdAt"`
	UpdatedAt        time.Time            `bson:"updatedAt" json:"updatedAt"`
}

type Purchase struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ArtworkID       primitive.ObjectID `bson:"artworkId" json:"artworkId"`
	BuyerID         primitive.ObjectID `bson:"buyerId" json:"buyerId"`
	License         string             `bson:"license" json:"license"`
	Amount          float64            `bson:"amount" json:"amount"`
	TransactionRef  string             `bson:"transactionRef,omitempty" json:"transactionRef,omitempty"`
	IdempotencyKey  string             `bson:"idempotencyKey,omitempty" json:"idempotencyKey,omitempty"`
	CreatedAt       time.Time          `bson:"createdAt" json:"createdAt"`
}

