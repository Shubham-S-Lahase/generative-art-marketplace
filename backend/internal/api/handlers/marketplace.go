package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"generative-art-marketplace/internal/config"
	"generative-art-marketplace/internal/models"
	marketlic "generative-art-marketplace/pkg/marketplace"
	"generative-art-marketplace/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MarketplaceHandler struct {
	db *database.MongoDB
}

func NewMarketplaceHandler(db *database.MongoDB, _ *config.Config) *MarketplaceHandler {
	return &MarketplaceHandler{db: db}
}

// PurchaseArtwork records a simulated purchase (mock checkout UI on the client).
func (h *MarketplaceHandler) PurchaseArtwork(c *gin.Context) {
	userID, ok := h.requireUser(c)
	if !ok {
		return
	}
	artworkID, ok := h.parseArtworkID(c)
	if !ok {
		return
	}

	var req struct {
		License          string `json:"license" binding:"required"`
		IdempotencyKey   string `json:"idempotencyKey"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if key := strings.TrimSpace(req.IdempotencyKey); key != "" {
		var existing models.Purchase
		err := h.db.Purchases().FindOne(c.Request.Context(), bson.M{
			"idempotencyKey": key,
			"buyerId":        userID,
		}).Decode(&existing)
		if err == nil {
			c.JSON(http.StatusOK, gin.H{
				"message":    "Purchase already completed",
				"amount":     existing.Amount,
				"purchase":   existing,
				"mode":       "mock",
				"idempotent": true,
			})
			return
		}
		if err != mongo.ErrNoDocuments {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	art, err := h.loadArtwork(artworkID)
	if err != nil {
		h.artworkError(c, err)
		return
	}
	if err := h.validatePurchaseEligibility(art, userID, req.License); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	purchase, err := h.completePurchase(c.Request.Context(), completePurchaseInput{
		ArtworkID:      artworkID,
		BuyerID:        userID,
		License:        req.License,
		Amount:         art.Marketplace.Price,
		TransactionRef: "mock_" + uuid.New().String(),
		IdempotencyKey: strings.TrimSpace(req.IdempotencyKey),
	})
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "Purchase already recorded"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Purchase recorded",
		"amount":   purchase.Amount,
		"purchase": purchase,
		"mode":     "mock",
	})
}

// GetCheckoutQuote re-validates sale state and returns the authoritative price before pay.
func (h *MarketplaceHandler) GetCheckoutQuote(c *gin.Context) {
	userID, ok := h.requireUser(c)
	if !ok {
		return
	}
	artworkID, ok := h.parseArtworkID(c)
	if !ok {
		return
	}
	license := c.Query("license")
	if license == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "license query parameter is required"})
		return
	}

	art, err := h.loadArtwork(artworkID)
	if err != nil {
		h.artworkError(c, err)
		return
	}
	if err := h.validatePurchaseEligibility(art, userID, license); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"artworkId": art.ID,
		"title":     art.Title,
		"license":   marketlic.NormalizeLicense(license),
		"amount":    art.Marketplace.Price,
		"forSale":   art.Marketplace.ForSale,
	})
}

func (h *MarketplaceHandler) GetMyPurchases(c *gin.Context) {
	userID, ok := h.requireUser(c)
	if !ok {
		return
	}
	h.listPurchasesForBuyer(c, userID)
}

func (h *MarketplaceHandler) GetMyLicenses(c *gin.Context) {
	userID, ok := h.requireUser(c)
	if !ok {
		return
	}
	purchases, err := h.fetchPurchases(bson.M{"buyerId": userID}, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load licenses"})
		return
	}
	licenses := make([]gin.H, 0, len(purchases))
	for _, p := range purchases {
		licenses = append(licenses, gin.H{
			"id":             p.ID,
			"artworkId":      p.ArtworkID,
			"license":        p.License,
			"licenseTerms":   marketlic.TermsFor(p.License),
			"amount":         p.Amount,
			"transactionRef": p.TransactionRef,
			"createdAt":      p.CreatedAt,
			"artwork":        p.Artwork,
			"canDownload":    true,
		})
	}
	c.JSON(http.StatusOK, licenses)
}

func (h *MarketplaceHandler) GetMySales(c *gin.Context) {
	userID, ok := h.requireUser(c)
	if !ok {
		return
	}

	cursor, err := h.db.Artworks().Find(context.TODO(), bson.M{"userId": userID}, options.Find().SetProjection(bson.M{"_id": 1}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load artworks"})
		return
	}
	var owned []models.Artwork
	if err := cursor.All(context.TODO(), &owned); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load artworks"})
		return
	}
	if len(owned) == 0 {
		c.JSON(http.StatusOK, []gin.H{})
		return
	}
	ids := make([]primitive.ObjectID, len(owned))
	for i, a := range owned {
		ids[i] = a.ID
	}

	purchases, err := h.fetchPurchases(bson.M{"artworkId": bson.M{"$in": ids}}, 200)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load sales"})
		return
	}
	c.JSON(http.StatusOK, purchases)
}

func (h *MarketplaceHandler) GetArtworkOwnership(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusOK, gin.H{"owned": false})
		return
	}
	artworkID, ok := h.parseArtworkID(c)
	if !ok {
		return
	}
	uid := userID.(primitive.ObjectID)
	license, owned, err := h.buyerLicenseForArtwork(artworkID, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"owned":   owned,
		"license": license,
		"terms":   marketlic.TermsFor(license),
	})
}

func (h *MarketplaceHandler) DownloadArtwork(c *gin.Context) {
	userID, ok := h.requireUser(c)
	if !ok {
		return
	}
	artworkID, ok := h.parseArtworkID(c)
	if !ok {
		return
	}

	license, owned, err := h.buyerLicenseForArtwork(artworkID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if !owned {
		c.JSON(http.StatusForbidden, gin.H{"error": "Purchase required to download this artwork"})
		return
	}

	art, err := h.loadArtwork(artworkID)
	if err != nil {
		h.artworkError(c, err)
		return
	}

	url := art.ImageURL
	if url == "" {
		url = art.PreviewURL
	}
	if url == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "No downloadable file for this artwork"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"downloadUrl": url,
		"license":     license,
		"licenseTerms": marketlic.TermsFor(license),
	})
}

type completePurchaseInput struct {
	ArtworkID      primitive.ObjectID
	BuyerID        primitive.ObjectID
	License        string
	Amount         float64
	TransactionRef string
	IdempotencyKey string
}

type purchaseWithArtwork struct {
	models.Purchase
	Artwork  gin.H  `json:"artwork"`
	Username string `json:"buyerUsername,omitempty"`
}

func (h *MarketplaceHandler) completePurchase(ctx context.Context, in completePurchaseInput) (*models.Purchase, error) {
	license := marketlic.NormalizeLicense(in.License)
	if !marketlic.IsValidLicense(license) {
		return nil, fmt.Errorf("invalid license type")
	}

	if in.TransactionRef != "" {
		var existing models.Purchase
		err := h.db.Purchases().FindOne(ctx, bson.M{"transactionRef": in.TransactionRef}).Decode(&existing)
		if err == nil {
			return &existing, nil
		}
		if err != mongo.ErrNoDocuments {
			return nil, err
		}
	}

	art, err := h.loadArtwork(in.ArtworkID)
	if err != nil {
		return nil, err
	}
	if err := h.validatePurchaseEligibility(art, in.BuyerID, license); err != nil {
		return nil, err
	}

	amount := in.Amount
	if amount <= 0 {
		amount = art.Marketplace.Price
	}

	purchase := models.Purchase{
		ArtworkID:      in.ArtworkID,
		BuyerID:        in.BuyerID,
		License:        license,
		Amount:         amount,
		TransactionRef: in.TransactionRef,
		IdempotencyKey: in.IdempotencyKey,
		CreatedAt:      time.Now(),
	}
	res, err := h.db.Purchases().InsertOne(ctx, purchase)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) && in.IdempotencyKey != "" {
			var existing models.Purchase
			if findErr := h.db.Purchases().FindOne(ctx, bson.M{
				"idempotencyKey": in.IdempotencyKey,
				"buyerId":        in.BuyerID,
			}).Decode(&existing); findErr == nil {
				return &existing, nil
			}
		}
		return nil, fmt.Errorf("failed to record purchase")
	}
	purchase.ID = res.InsertedID.(primitive.ObjectID)

	artUpdate := bson.M{
		"$inc": bson.M{"marketplace.sales": 1},
		"$set": bson.M{"updatedAt": time.Now()},
	}
	if marketlic.IsExclusiveLicense(license) || art.Marketplace.Exclusivity {
		artUpdate["$set"].(bson.M)["marketplace.forSale"] = false
	}
	_, _ = h.db.Artworks().UpdateOne(ctx, bson.M{"_id": in.ArtworkID}, artUpdate)

	if !sameUserIDs(art.UserID, in.BuyerID) {
		src := in.ArtworkID
		createNotification(h.db, art.UserID, "purchase", "Artwork purchased",
			fmt.Sprintf("%s was purchased (%s license)", art.Title, license), &src)
	}

	return &purchase, nil
}

func (h *MarketplaceHandler) validatePurchaseEligibility(art models.Artwork, buyerID primitive.ObjectID, license string) error {
	if !art.Marketplace.ForSale {
		return fmt.Errorf("artwork is not for sale")
	}
	if art.Marketplace.Price <= 0 {
		return fmt.Errorf("invalid artwork price")
	}
	if sameUserIDs(art.UserID, buyerID) {
		return fmt.Errorf("cannot purchase your own artwork")
	}
	if !marketlic.LicenseAllowed(license, art.Marketplace.Licensing) {
		return fmt.Errorf("license not offered for this artwork")
	}

	if marketlic.IsExclusiveLicense(license) || art.Marketplace.Exclusivity {
		count, err := h.db.Purchases().CountDocuments(context.TODO(), bson.M{"artworkId": art.ID})
		if err != nil {
			return fmt.Errorf("database error")
		}
		if count > 0 {
			return fmt.Errorf("artwork already sold (exclusive)")
		}
	}

	var existing models.Purchase
	err := h.db.Purchases().FindOne(context.TODO(), bson.M{
		"artworkId": art.ID,
		"buyerId":   buyerID,
	}).Decode(&existing)
	if err == nil {
		return fmt.Errorf("you already own a license for this artwork")
	}
	if err != mongo.ErrNoDocuments {
		return fmt.Errorf("database error")
	}
	return nil
}

func (h *MarketplaceHandler) buyerLicenseForArtwork(artworkID, buyerID primitive.ObjectID) (license string, owned bool, err error) {
	var p models.Purchase
	err = h.db.Purchases().FindOne(context.TODO(), bson.M{
		"artworkId": artworkID,
		"buyerId":   buyerID,
	}).Decode(&p)
	if err == mongo.ErrNoDocuments {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return p.License, true, nil
}

func (h *MarketplaceHandler) listPurchasesForBuyer(c *gin.Context, buyerID primitive.ObjectID) {
	purchases, err := h.fetchPurchases(bson.M{"buyerId": buyerID}, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load purchases"})
		return
	}
	c.JSON(http.StatusOK, purchases)
}

func (h *MarketplaceHandler) fetchPurchases(filter bson.M, limit int64) ([]purchaseWithArtwork, error) {
	opts := options.Find().SetSort(bson.M{"createdAt": -1}).SetLimit(limit)
	cursor, err := h.db.Purchases().Find(context.TODO(), filter, opts)
	if err != nil {
		return nil, err
	}
	var rows []models.Purchase
	if err := cursor.All(context.TODO(), &rows); err != nil {
		return nil, err
	}

	out := make([]purchaseWithArtwork, 0, len(rows))
	for _, p := range rows {
		item := purchaseWithArtwork{Purchase: p}
		var art models.Artwork
		if err := h.db.Artworks().FindOne(context.TODO(), bson.M{"_id": p.ArtworkID}).Decode(&art); err == nil {
			username := ""
			var user models.User
			if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": art.UserID}).Decode(&user); err == nil {
				username = user.Username
			}
			buyerName := ""
			var buyer models.User
			if err := h.db.Users().FindOne(context.TODO(), bson.M{"_id": p.BuyerID}).Decode(&buyer); err == nil {
				buyerName = buyer.Username
			}
			item.Artwork = gin.H{
				"id":          art.ID,
				"title":       art.Title,
				"previewUrl":  art.PreviewURL,
				"imageUrl":    art.ImageURL,
				"username":    username,
				"marketplace": art.Marketplace,
			}
			item.Username = buyerName
		}
		out = append(out, item)
	}
	return out, nil
}

func (h *MarketplaceHandler) loadArtwork(id primitive.ObjectID) (models.Artwork, error) {
	var art models.Artwork
	err := h.db.Artworks().FindOne(context.TODO(), bson.M{"_id": id}).Decode(&art)
	return art, err
}

func (h *MarketplaceHandler) requireUser(c *gin.Context) (primitive.ObjectID, bool) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return primitive.NilObjectID, false
	}
	return userID.(primitive.ObjectID), true
}

func (h *MarketplaceHandler) parseArtworkID(c *gin.Context) (primitive.ObjectID, bool) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid artwork ID"})
		return primitive.NilObjectID, false
	}
	return id, true
}

func (h *MarketplaceHandler) artworkError(c *gin.Context, err error) {
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Artwork not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
}

func sameUserIDs(a, b primitive.ObjectID) bool {
	return !a.IsZero() && !b.IsZero() && a.Hex() == b.Hex()
}
