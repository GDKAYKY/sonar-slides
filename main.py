import os
import tkinter as tk
import requests
import pandas as pd
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, url_for, send_from_directory
from dotenv import load_dotenv
from tkinter import messagebox
import json

load_dotenv()

TOKEN = os.getenv("SONARQUBE_TOKEN")
SONAR_URL = os.getenv("SONARQUBE_URL", "https://sonar.prd.whoid.com/api/measures/component")
SONAR_HISTORY_URL = os.getenv("SONAR_HISTORY_URL", "https://sonar.prd.whoid.com/api/measures/search_history")

METRICS = "bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,security_hotspots,reliability_rating,security_rating,sqale_rating"

def get_project_measures(project_key):
    params = {
        "component": project_key,
        "metricKeys": METRICS,
    }
    auth = (TOKEN, "") if TOKEN else None
    response = requests.get(SONAR_URL, params=params, auth=auth)
    response.raise_for_status()
    payload = response.json()

    measures = payload.get("component", {}).get("measures", [])
    metrics_map = {m.get("metric"): m.get("value") for m in measures}

    def pct(value):
        try:
            return f"{float(value):.1f}%"
        except Exception:
            return "0.0%"

    return {
        "projeto": project_key,
        "data_consulta": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "bugs": int(float(metrics_map.get("bugs", 0) or 0)),
        "vulnerabilidades": int(float(metrics_map.get("vulnerabilities", 0) or 0)),
        "code_smells": int(float(metrics_map.get("code_smells", 0) or 0)),
        "security_hotspots": int(float(metrics_map.get("security_hotspots", 0) or 0)),
        "coverage": pct(metrics_map.get("coverage", 0)),
        "duplicacoes": pct(metrics_map.get("duplicated_lines_density", 0)),
        "reliability_rating": metrics_map.get("reliability_rating", "N/A"),
        "security_rating": metrics_map.get("security_rating", "N/A"),
        "sqale_rating": metrics_map.get("sqale_rating", "N/A"),
    }

def get_project_history(project_key, metric, from_date=None, to_date=None):
    params = {
        "component": project_key,
        "metrics": metric,
        "ps": 100  
    }
    
    if from_date:
        params["from"] = from_date
    if to_date:
        params["to"] = to_date
    
    auth = (TOKEN, "") if TOKEN else None
    response = requests.get(SONAR_HISTORY_URL, params=params, auth=auth)
    response.raise_for_status()
    payload = response.json()
    
    return payload.get("measures", [])

def exportar_dados_sonarqube(project_key, from_date=None, to_date=None, arquivo=None):
    if not arquivo:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        arquivo = f"sonarqube_export_{project_key}_{timestamp}.xlsx"
    
    dados_atuais = get_project_measures(project_key)
    metricas_historico = ["bugs", "vulnerabilities", "code_smells"]
    dados_historicos = []
    
    for metrica in metricas_historico:
        try:
            history = get_project_history(project_key, metrica, from_date, to_date)
            for measure in history:
                for value in measure.get("history", []):
                    dados_historicos.append({
                        "projeto": project_key,
                        "metrica": metrica,
                        "data": value.get("date", ""),
                        "valor": value.get("value", 0)
                    })
        except Exception as e:
            print(f"Erro ao obter histórico para {metrica}: {e}")

    with pd.ExcelWriter(arquivo, engine='openpyxl') as writer:
        df_atual = pd.DataFrame([dados_atuais])
        df_atual.to_excel(writer, sheet_name='Dados_Atuais', index=False)
        
        if dados_historicos:
            df_historico = pd.DataFrame(dados_historicos)
            df_historico.to_excel(writer, sheet_name='Historico_Temporal', index=False)
        
        if dados_historicos:
            df_resumo = df_historico.groupby(['projeto', 'metrica']).agg({
                'valor': ['min', 'max', 'mean', 'last']
            }).round(2)
            df_resumo.columns = ['Valor_Min', 'Valor_Max', 'Valor_Medio', 'Valor_Atual']
            df_resumo.reset_index().to_excel(writer, sheet_name='Resumo_Periodo', index=False)
    
    print(f"Exportação concluída: {arquivo}")
    return arquivo

def gerar_planilha(dados, arquivo="code_smells.xlsx"):
    df = pd.DataFrame(dados)
    df.to_excel(arquivo, index=False)
    print(f"Planilha gerada: {arquivo}")

def consultar_sonarqube_periodo(project_key, from_date, to_date):
    try:
        if isinstance(from_date, str):
            from_date = datetime.strptime(from_date, "%Y-%m-%d")
        if isinstance(to_date, str):
            to_date = datetime.strptime(to_date, "%Y-%m-%d")
        
        # Formatar datas para API
        from_str = from_date.strftime("%Y-%m-%d")
        to_str = to_date.strftime("%Y-%m-%d")
        
        # Obter dados atuais
        dados_atuais = get_project_measures(project_key)
        
        # Obter histórico para o período
        metricas = ["bugs", "vulnerabilities", "code_smells"]
        historico_periodo = {}
        
        for metrica in metricas:
            try:
                history = get_project_history(project_key, metrica, from_str, to_str)
                historico_periodo[metrica] = history
            except Exception as e:
                historico_periodo[metrica] = []
                print(f"Erro ao obter histórico para {metrica}: {e}")
        
        return {
            "projeto": project_key,
            "periodo": {
                "de": from_str,
                "ate": to_str
            },
            "dados_atuais": dados_atuais,
            "historico_periodo": historico_periodo
        }
        
    except Exception as e:
        return {"error": str(e)}

def _bucket_key_from_date_iso(date_str, period):
    try:
        date_part = date_str[:10]
        dt = datetime.strptime(date_part, "%Y-%m-%d")
        if period == "day":
            return dt.strftime("%Y-%m-%d")
        if period == "week":
            iso_year, iso_week, _ = dt.isocalendar()
            return f"{iso_year}-W{iso_week:02d}"
        if period == "month":
            return dt.strftime("%Y-%m")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return date_str[:10]

def agrupar_historico_por_periodo(project_key, categorias, from_date, to_date, period="month", agg="last"):
    categorias = categorias or ["bugs", "vulnerabilities", "code_smells"]
    period = (period or "month").lower()
    agg = (agg or "last").lower()

    dados = []

    for metrica in categorias:
        try:
            measures = get_project_history(project_key, metrica, from_date, to_date)
            # measures: list with entries having 'metric' and 'history'
            bucket_to_values = {}
            bucket_to_last = {}
            for measure in measures:
                for item in measure.get("history", []):
                    data_iso = item.get("date", "")
                    valor = item.get("value")
                    try:
                        valor_num = float(valor) if valor is not None else None
                    except Exception:
                        valor_num = None
                    bucket = _bucket_key_from_date_iso(data_iso, period)
                    if valor_num is None:
                        continue
                    bucket_to_values.setdefault(bucket, []).append(valor_num)
                    bucket_to_last[bucket] = valor_num

            for bucket, values in bucket_to_values.items():
                if agg == "avg":
                    valor_agr = sum(values) / len(values) if values else 0
                elif agg == "min":
                    valor_agr = min(values) if values else 0
                elif agg == "max":
                    valor_agr = max(values) if values else 0
                else:  # last
                    valor_agr = bucket_to_last.get(bucket, values[-1])

                dados.append({
                    "projeto": project_key,
                    "metrica": metrica,
                    "bucket": bucket,
                    "valor": valor_agr
                })
        except Exception as e:
            dados.append({
                "projeto": project_key,
                "metrica": metrica,
                "erro": str(e)
            })

    return {
        "projeto": project_key,
        "periodo": {"de": from_date, "ate": to_date},
        "group_by": period,
        "agg": agg,
        "dados": dados
    }

def main(project_key, datas):
    resultados = []
    for _ in datas:
        medidas = get_project_measures(project_key)
        resultados.append({
            "data": datetime.now().strftime("%Y-%m-%d"), 
            "code_smells": medidas["code_smells"],
            "bugs": medidas["bugs"],
            "vulnerabilidades": medidas["vulnerabilidades"]
        })
    
    total_code_smells = sum(r["code_smells"] for r in resultados)
    total_bugs = sum(r["bugs"] for r in resultados)
    total_vulnerabilidades = sum(r["vulnerabilidades"] for r in resultados)
    
    resultados.append({
        "data": "Total Geral", 
        "code_smells": total_code_smells,
        "bugs": total_bugs,
        "vulnerabilidades": total_vulnerabilidades
    })
    
    gerar_planilha(resultados)


app = Flask(__name__)

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/site.css')
def send_site_css():
    return send_from_directory('static', 'site.css')

@app.route('/script.js')
def send_script_js():
    return send_from_directory('static', 'script.js')

@app.route('/image.svg')
def send_image_svg():
    return send_from_directory('static', 'image.svg')

def executar_analise(projeto):
    return get_project_measures(projeto)

@app.route('/api/projeto/<projeto>')
def api_projeto(projeto):
    try:
        return jsonify(executar_analise(projeto))
    except requests.HTTPError as http_err:
        return jsonify({"error": str(http_err)}), 502
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route('/api/medidas', methods=['GET'])
def api_medidas():
    try:
        component = request.args.get('component', '')
        metric_keys = request.args.get('metricKeys', METRICS)
        
        print(f"[DEBUG] Consulta recebida - Component: {component}, Metrics: {metric_keys}")
        print(f"[DEBUG] TOKEN configurado: {'SIM' if TOKEN else 'NÃO'}")
        
        if not component:
            return jsonify({"error": "Parâmetro 'component' é obrigatório"}), 400
        
        sonar_api_url = "https://sonar.prd.whoid.com/api/measures/component"
        print(f"[DEBUG] URL da API SonarQube: {sonar_api_url}")
        
        params = {
            "component": component,
            "metricKeys": metric_keys,
        }
        
        print(f"[DEBUG] Parâmetros da requisição: {params}")
        
        auth = (TOKEN, "") if TOKEN else None
        print(f"[DEBUG] Autenticação configurada: {auth is not None}")
        
        print(f"[DEBUG] Fazendo requisição para SonarQube...")
        response = requests.get(sonar_api_url, params=params, auth=auth, timeout=30)
        
        print(f"[DEBUG] Status da resposta: {response.status_code}")
        print(f"[DEBUG] Headers da resposta: {dict(response.headers)}")
        
        response.raise_for_status()
        payload = response.json()
        
        print(f"[DEBUG] Resposta processada com sucesso")
        
        return jsonify(payload)
        
    except requests.exceptions.Timeout:
        print(f"[ERROR] Timeout na requisição para SonarQube")
        return jsonify({"error": "Timeout na conexão com SonarQube"}), 504
    except requests.exceptions.ConnectionError as e:
        print(f"[ERROR] Erro de conexão: {e}")
        return jsonify({"error": f"Erro de conexão com SonarQube: {e}"}), 502
    except requests.HTTPError as http_err:
        print(f"[ERROR] Erro HTTP do SonarQube: {http_err}")
        print(f"[ERROR] Status: {http_err.response.status_code}")
        print(f"[ERROR] Conteúdo: {http_err.response.text}")
        return jsonify({"error": f"Erro do SonarQube: {http_err}"}), 502
    except Exception as err:
        print(f"[ERROR] Erro inesperado: {err}")
        return jsonify({"error": str(err)}), 500

@app.route('/api/medidas/<component>')
def api_medidas_component(component):
    try:
        metric_keys = request.args.get('metricKeys', METRICS)
        sonar_api_url = "https://sonar.prd.whoid.com/api/measures/component"
        
        params = {
            "component": component,
            "metricKeys": metric_keys,
        }
        
        auth = (TOKEN, "") if TOKEN else None
        response = requests.get(sonar_api_url, params=params, auth=auth)
        response.raise_for_status()
        payload = response.json()
        return jsonify(payload)
        
    except requests.HTTPError as http_err:
        return jsonify({"error": str(http_err)}), 502
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route('/api/exportar/<projeto>')
def api_exportar_projeto(projeto):
    try:
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        
        arquivo = exportar_dados_sonarqube(projeto, from_date, to_date)
        return jsonify({
            "success": True,
            "arquivo": arquivo,
            "mensagem": "Exportação concluída com sucesso"
        })
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route('/api/consultar_periodo/<projeto>')
def api_consultar_periodo(projeto):
    try:
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        
        if not from_date or not to_date:
            return jsonify({"error": "Parâmetros from_date e to_date são obrigatórios"}), 400
        
        resultado = consultar_sonarqube_periodo(projeto, from_date, to_date)
        return jsonify(resultado)
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route('/api/consultar_periodo_agrupado/<projeto>')
def api_consultar_periodo_agrupado(projeto):
    try:
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        period = request.args.get('group_by', 'month')  # day|week|month
        agg = request.args.get('agg', 'last')  # last|min|max|avg
        categorias_raw = request.args.get('categorias') or request.args.get('categories')
        categorias = [c.strip() for c in categorias_raw.split(',')] if categorias_raw else ["bugs", "vulnerabilities", "code_smells"]

        if not from_date or not to_date:
            return jsonify({"error": "Parâmetros from_date e to_date são obrigatórios"}), 400

        resultado = agrupar_historico_por_periodo(projeto, categorias, from_date, to_date, period, agg)
        return jsonify(resultado)
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=8080)
