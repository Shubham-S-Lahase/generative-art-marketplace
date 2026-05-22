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
func (db *MongoDB) Bookmarks() *mongo.Collection     { return db.Database.Collection("bookmarks") }
func (db *MongoDB) Notifications() *mongo.Collection { return db.Database.Collection("notifications") }
func (db *MongoDB) Sessions() *mongo.Collection      { return db.Database.Collection("sessions") }
func (db *MongoDB) Purchases() *mongo.Collection     { return db.Database.Collection("purchases") }
func (db *MongoDB) ArtworkViews() *mongo.Collection  { return db.Database.Collection("artwork_views") }

