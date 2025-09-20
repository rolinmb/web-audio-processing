package main

import (
	"log"
	"net/http"
)

func main() {
	// Serve static files from ./static directory
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	log.Println("Serving on http://localhost:8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}
