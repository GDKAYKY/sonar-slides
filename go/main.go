package main

import (
	"encoding/json"
	"fmt"
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
	sonarURL        string
	sonarToken      string
	defBranch       string
	sonarHistoryURL string
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

// proxy para histórico do SonarQube: /api/historico
// parâmetros: component, metrics, from, to, branch
func historicoHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	component := q.Get("component")
	if component == "" {
		http.Error(w, "Parâmetro 'component' é obrigatório", http.StatusBadRequest)
		return
	}
	metrics := q.Get("metrics")
	if metrics == "" {
		metrics = "bugs,vulnerabilities,code_smells"
	}
	fromDate := q.Get("from")
	toDate := q.Get("to")
	branch := q.Get("branch")
	if branch == "" {
		branch = defBranch
	}

	params := url.Values{}
	params.Set("component", component)
	params.Set("metrics", metrics)
	if fromDate != "" {
		params.Set("from", fromDate)
	}
	if toDate != "" {
		params.Set("to", toDate)
	}
	params.Set("ps", "500")
	params.Set("branch", branch)

	client := &http.Client{Timeout: 30 * time.Second}
	reqURL := sonarHistoryURL + "?" + params.Encode()
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

// Gera um arquivo Excel-compatível (HTML table) para download sem dependências externas
func exportXlsHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	component := q.Get("component")
	if component == "" {
		http.Error(w, "Parâmetro 'component' é obrigatório", http.StatusBadRequest)
		return
	}
	metricKeys := q.Get("metricKeys")
	if metricKeys == "" {
		metricKeys = "bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density"
	}
	branch := q.Get("branch")
	if branch == "" {
		branch = defBranch
	}

	// Consultar Sonar
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
	if resp.StatusCode != http.StatusOK {
		w.WriteHeader(http.StatusBadGateway)
		io.Copy(w, resp.Body)
		return
	}

	var payload struct {
		Component struct {
			Key      string `json:"key"`
			Measures []struct {
				Metric string `json:"metric"`
				Value  string `json:"value"`
			} `json:"measures"`
		} `json:"component"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		http.Error(w, "Erro parseando resposta do SonarQube", http.StatusInternalServerError)
		return
	}

	type kv struct{ Name, Value string }
	rows := []kv{{"Project", payload.Component.Key}, {"Generated", time.Now().Format("2006-01-02")}}
	wanted := map[string]string{
		"bugs":                     "Bugs",
		"vulnerabilities":          "Vulnerabilities",
		"code_smells":              "Code Smells",
		"coverage":                 "Coverage",
		"duplicated_lines_density": "Duplicated Lines",
	}
	values := map[string]string{}
	for _, m := range payload.Component.Measures {
		values[m.Metric] = m.Value
	}
	for key, label := range wanted {
		rows = append(rows, kv{label, values[key]})
	}

	html := "<html><head><meta charset=\"UTF-8\"></head><body><table border=\"1\">"
	html += "<tr><th>Field</th><th>Value</th></tr>"
	for _, r := range rows {
		html += fmt.Sprintf("<tr><td>%s</td><td>%s</td></tr>", r.Name, r.Value)
	}
	html += "</table></body></html>"

	filename := fmt.Sprintf("%s-SonarQube-%s.xls", payload.Component.Key, time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "application/vnd.ms-excel; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	_, _ = w.Write([]byte(html))
}

func main() {
	loadEnv()
	sonarURL = getEnv("SONARQUBE_URL", "https://sonar.prd.whoid.com/api/measures/component")
	sonarToken = getEnv("SONARQUBE_TOKEN", "")
	defBranch = getEnv("SONAR_DEFAULT_BRANCH", "main")
	sonarHistoryURL = getEnv("SONAR_HISTORY_URL", "https://sonar.prd.whoid.com/api/measures/search_history")

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
	http.HandleFunc("/api/historico", historicoHandler)
	http.HandleFunc("/api/export/xls", exportXlsHandler)

	addr := ":8080"
	log.Printf("Servidor rodando em http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
