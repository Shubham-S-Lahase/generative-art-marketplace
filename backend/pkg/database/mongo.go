package database

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MongoDB wraps the Mongo client and exposes typed collection helpers.
type MongoDB struct {
	Client   *mongo.Client
	Database *mongo.Database
}

func Connect(uri, dbName string) (*MongoDB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	log.Printf("connected to MongoDB: %s", uri)
	db := &MongoDB{
		Client:   client,
		Database: client.Database(dbName),
	}
	db.ensureIndexes(ctx)
	return db, nil
}

func (db *MongoDB) ensureIndexes(ctx context.Context) {
	_, err := db.ArtworkViews().Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.M{"artworkId": 1, "viewerKey": 1},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("artwork_views index: %v", err)
	}
	_, err = db.Purchases().Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.M{"transactionRef": 1},
		Options: options.Index().SetUnique(true).SetSparse(true),
	})
	if err != nil {
		log.Printf("purchases transactionRef index: %v", err)
	}
	_, err = db.Purchases().Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.M{"buyerId": 1, "artworkId": 1},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("purchases buyer artwork index: %v", err)
	}
	_, err = db.Purchases().Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.M{"idempotencyKey": 1},
		Options: options.Index().SetUnique(true).SetSparse(true),
	})
	if err != nil {
		log.Printf("purchases idempotencyKey index: %v", err)
	}
	_, err = db.RecentlyViewed().Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.M{"userId": 1, "artworkId": 1},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Printf("recently_viewed index: %v", err)
	}
	_, err = db.SavedSearches().Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "userId", Value: 1}, {Key: "createdAt", Value: -1}},
	})
	if err != nil {
		log.Printf("saved_searches index: %v", err)
	}
	_, err = db.SearchLogs().Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.M{"createdAt": 1},
		Options: options.Index().SetExpireAfterSeconds(60 * 60 * 24 * 90), // 90 days TTL
	})
	if err != nil {
		log.Printf("search_logs TTL index: %v", err)
	}
}

func (db *MongoDB) Close(ctx context.Context) error {
	return db.Client.Disconnect(ctx)
}

// Collection helpers
func (db *MongoDB) Users() *mongo.Collection         { return db.Database.Collection("users") }
func (db *MongoDB) Artworks() *mongo.Collection      { return db.Database.Collection("artworks") }
func (db *MongoDB) Likes() *mongo.Collection         { return db.Database.Collection("likes") }
func (db *MongoDB) Comments() *mongo.Collection      { return db.Database.Collection("comments") }
func (db *MongoDB) CommentLikes() *mongo.Collection  { return db.Database.Collection("comment_likes") }
func (db *MongoDB) Follows() *mongo.Collection       { return db.Database.Collection("follows") }
func (db *MongoDB) Bookmarks() *mongo.Collection      { return db.Database.Collection("bookmarks") }
func (db *MongoDB) RecentlyViewed() *mongo.Collection { return db.Database.Collection("recently_viewed") }
func (db *MongoDB) SearchLogs() *mongo.Collection     { return db.Database.Collection("search_logs") }
func (db *MongoDB) SavedSearches() *mongo.Collection  { return db.Database.Collection("saved_searches") }
func (db *MongoDB) Notifications() *mongo.Collection { return db.Database.Collection("notifications") }
func (db *MongoDB) Sessions() *mongo.Collection      { return db.Database.Collection("sessions") }
func (db *MongoDB) Purchases() *mongo.Collection     { return db.Database.Collection("purchases") }
func (db *MongoDB) ArtworkViews() *mongo.Collection  { return db.Database.Collection("artwork_views") }
func (db *MongoDB) Presets() *mongo.Collection         { return db.Database.Collection("presets") }
func (db *MongoDB) Reports() *mongo.Collection         { return db.Database.Collection("reports") }
func (db *MongoDB) PasswordResets() *mongo.Collection  { return db.Database.Collection("password_resets") }

