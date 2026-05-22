package websocket

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type Client struct {
	Conn      *websocket.Conn
	UserID    string
	SessionID string
	Send      chan []byte
}

type Hub struct {
	mu        sync.RWMutex
	clients   map[string]map[*Client]bool // sessionID -> clients set
	broadcast chan *Message
}

type Message struct {
	SessionID string
	Payload   []byte
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[string]map[*Client]bool),
		broadcast: make(chan *Message, 256),
	}
}

func (h *Hub) Run() {
	for msg := range h.broadcast {
		h.mu.RLock()
		clients := h.clients[msg.SessionID]
		h.mu.RUnlock()
		for c := range clients {
			select {
			case c.Send <- msg.Payload:
			default:
				log.Printf("dropping message to client")
			}
		}
	}
}

func (h *Hub) Register(sessionID string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[sessionID] == nil {
		h.clients[sessionID] = make(map[*Client]bool)
	}
	h.clients[sessionID][client] = true
}

func (h *Hub) Unregister(sessionID string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if clients, ok := h.clients[sessionID]; ok {
		if _, found := clients[client]; found {
			delete(clients, client)
			close(client.Send)
		}
		if len(clients) == 0 {
			delete(h.clients, sessionID)
		}
	}
}

func (h *Hub) Broadcast(sessionID string, payload []byte) {
	h.broadcast <- &Message{SessionID: sessionID, Payload: payload}
}

