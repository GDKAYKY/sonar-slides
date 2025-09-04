package main

import (
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/joho/godotenv"
)

var (
	sonarURL   string
	sonarToken string
	defBranch  string
)

func loadEnv() {
	_ = godotenv.Load(".env")
	wd, _ := os.Getwd()
	rootConfig := filepath.Join(filepath.Dir(wd), "config.env")
	_ = godotenv.Load(rootConfig)
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func medidasHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	component := q.Get("component")
	if component == "" {
		http.Error(w, "Parâmetro 'component' é obrigatório", http.StatusBadRequest)
		return
	}
	metricKeys := q.Get("metricKeys")
	if metricKeys == "" {
		metricKeys = "bugs,vulnerabilities,code_smells"
	}
	branch := q.Get("branch")
	if branch == "" {
		branch = defBranch
	}

	params := url.Values{}
	params.Set("component", component)
	params.Set("metricKeys", metricKeys)
	params.Set("branch", branch)

	client := &http.Client{Timeout: 30 * time.Second}
	reqURL := sonarURL + "?" + params.Encode()
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		http.Error(w, "Erro criando requisição", http.StatusInternalServerError)
		return
	}
	if sonarToken != "" {
		req.SetBasicAuth(sonarToken, "")
	}

	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vals := range resp.Header {
		for _, v := range vals {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func main() {
	loadEnv()
	sonarURL = getEnv("SONARQUBE_URL", "https://sonar.prd.whoid.com/api/measures/component")
	sonarToken = getEnv("SONARQUBE_TOKEN", "")
	defBranch = getEnv("SONAR_DEFAULT_BRANCH", "main")

	staticDir := "static"
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})

	http.HandleFunc("/api/medidas", medidasHandler)

	addr := ":8080"
	log.Printf("Servidor rodando em http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
