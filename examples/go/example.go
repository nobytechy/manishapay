// ManishaPay — Go example.
//
// Run:
//   API_KEY=mp_test_xxx go run example.go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

func main() {
	apiBase := os.Getenv("API_BASE")
	if apiBase == "" {
		apiBase = "https://api.manishapay.dev"
	}
	apiKey := os.Getenv("API_KEY")
	if apiKey == "" {
		fmt.Fprintln(os.Stderr, "Set API_KEY=mp_test_xxx first.")
		os.Exit(1)
	}

	body, _ := json.Marshal(map[string]string{
		"reference":   fmt.Sprintf("INV-%d", time.Now().Unix()),
		"amount":      "10.00",
		"description": "Pro plan",
		"email":       "buyer@test.com",
	})

	req, _ := http.NewRequest("POST", apiBase+"/v1/pay", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Request-Id", fmt.Sprintf("go-%d", time.Now().UnixMilli()))

	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Network error:", err)
		os.Exit(1)
	}
	defer res.Body.Close()

	respBody, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		fmt.Fprintf(os.Stderr, "ManishaPay error (%d): %s\n", res.StatusCode, respBody)
		os.Exit(1)
	}
	fmt.Println(string(respBody))
}
