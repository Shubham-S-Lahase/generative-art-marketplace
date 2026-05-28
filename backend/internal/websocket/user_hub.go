package websocket

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type UserClient struct {
	Conn   *websocket.Conn
	UserID string
	Send   chan []byte
}

type UserMessage struct {
	UserID  string
	Payload []byte
}

type UserHub struct {
	mu        sync.RWMutex
	clients   map[string]map[*UserClient]bool // userID -> clients set
	broadcast chan *UserMessage
}

func NewUserHub() *UserHub {
	return &UserHub{
		clients:   make(map[string]map[*UserClient]bool),
		broadcast: make(chan *UserMessage, 512),
	}
}

func (h *UserHub) Run() {
	for msg := range h.broadcast {
		h.mu.RLock()
		clients := h.clients[msg.UserID]
		h.mu.RUnlock()
		for c := range clients {
			select {
			case c.Send <- msg.Payload:
			default:
				log.Printf("dropping realtime event for user %s", msg.UserID)
			}
		}
	}
}

func (h *UserHub) Register(userID string, client *UserClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[userID] == nil {
		h.clients[userID] = make(map[*UserClient]bool)
	}
	h.clients[userID][client] = true
}

func (h *UserHub) Unregister(userID string, client *UserClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if clients, ok := h.clients[userID]; ok {
		if _, found := clients[client]; found {
			delete(clients, client)
			close(client.Send)
		}
		if len(clients) == 0 {
			delete(h.clients, userID)
		}
	}
}

func (h *UserHub) BroadcastToUser(userID string, payload []byte) {
	if userID == "" || len(payload) == 0 {
		return
	}
	h.broadcast <- &UserMessage{UserID: userID, Payload: payload}
}
