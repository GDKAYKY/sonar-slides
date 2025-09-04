const form = document.querySelector('form');
const resultado = document.querySelector('#resultado');

let latestData = null;
let latestHistory = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Falha ao carregar script: ' + src));
        document.head.appendChild(s);
    });
}

async function ensureXLSX() {
    if (typeof window.XLSX === 'undefined') {
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js');
    }
    if (typeof window.XLSX === 'undefined') {
        throw new Error('Biblioteca XLSX não disponível');
    }
}

function updateMetricsFromPayload(payload) {
    const bugCount = document.getElementById('bugCount');
    const vulnerabilityCount = document.getElementById('vulnerabilityCount');
    const codeSmellCount = document.getElementById('codeSmellCount');
    
    // Atualizar métricas principais
    if (payload.component && payload.component.measures) {
        const measures = payload.component.measures;
        
        // Buscar valores das métricas
        const bugs = measures.find(m => m.metric === 'bugs')?.value || 0;
        const vulnerabilities = measures.find(m => m.metric === 'vulnerabilities')?.value || 0;
        const codeSmells = measures.find(m => m.metric === 'code_smells')?.value || 0;
        
        bugCount.textContent = bugs;
        vulnerabilityCount.textContent = vulnerabilities;
        codeSmellCount.textContent = codeSmells;
        
        // Atualizar informações adicionais
        updateInfoDisplay(payload.component.key, new Date().toLocaleString());
        
        // Armazenar dados para exportação
        latestData = {
            projeto: payload.component.key,
            bugs: parseInt(bugs),
            vulnerabilidades: parseInt(vulnerabilities),
            code_smells: parseInt(codeSmells),
            data_consulta: new Date().toISOString()
        };
    }
}

function updateInfoDisplay(component, lastUpdate) {
    const currentComponent = document.getElementById('currentComponent');
    const lastUpdateElement = document.getElementById('lastUpdate');
    
    if (currentComponent) currentComponent.textContent = component;
    if (lastUpdateElement) lastUpdateElement.textContent = lastUpdate;
}

function exportToExcel(payload) {
    const projectName = payload?.projeto || 'Projeto';
    const timestamp = new Date().toISOString().split('T')[0];
    
    console.log('Iniciando exportação para:', projectName);
    console.log('Dados para exportação:', payload);
    
    // Criar dados para Excel
    const excelData = [
        {
            'Project': projectName,
            'Generated': timestamp,
            'Metric': 'Bugs',
            'Value': payload?.bugs ?? 0,
            'Rating': '-'
        },
        {
            'Project': projectName,
            'Generated': timestamp,
            'Metric': 'Vulnerabilities',
            'Value': payload?.vulnerabilidades ?? 0,
            'Rating': '-'
        },
        {
            'Project': projectName,
            'Generated': timestamp,
            'Metric': 'Code Smells',
            'Value': payload?.code_smells ?? 0,
            'Rating': '-'
        },
        {
            'Project': projectName,
            'Generated': timestamp,
            'Metric': 'Coverage',
            'Value': payload?.coverage ?? '0%',
            'Rating': '-'
        },
        {
            'Project': projectName,
            'Generated': timestamp,
            'Metric': 'Duplicated Lines',
            'Value': payload?.duplicacoes ?? '0%',
            'Rating': '-'
        }
    ];
    
    // Converter para CSV (formato mais compatível)
    const headers = Object.keys(excelData[0]);
    const csvContent = [
        headers.join(','),
        ...excelData.map(row => headers.map(header => row[header]).join(','))
    ].join('\n');
    
    console.log('Conteúdo CSV gerado:', csvContent);
    
    try {
        // Método 1: Usando Blob e download
        const blob = new Blob([csvContent], { 
            type: 'text/csv;charset=utf-8;' 
        });
        
        // Criar URL do blob
        const url = window.URL.createObjectURL(blob);
        
        // Criar elemento de download
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `${projectName}-SonarQube-${timestamp}.csv`;
        downloadLink.style.display = 'none';
        
        console.log('Nome do arquivo:', downloadLink.download);
        
        // Adicionar ao DOM
        document.body.appendChild(downloadLink);
        
        // Simular clique
        downloadLink.click();
        
        // Limpar após um tempo
        setTimeout(() => {
            document.body.removeChild(downloadLink);
            window.URL.revokeObjectURL(url);
            console.log('Download concluído e recursos limpos');
        }, 1000);
        
        console.log('Exportação para Excel concluída:', downloadLink.download);
        
        // Mostrar mensagem de sucesso
        alert(`Arquivo baixado com sucesso: ${downloadLink.download}`);
        
    } catch (error) {
        console.error('Erro na exportação:', error);
        
        // Método alternativo se o primeiro falhar
        try {
            console.log('Tentando método alternativo...');
            
            // Criar link direto
            const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
            const downloadLink = document.createElement('a');
            downloadLink.href = dataStr;
            downloadLink.download = `${projectName}-SonarQube-${timestamp}.csv`;
            downloadLink.style.display = 'none';
            
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            console.log('Método alternativo funcionou!');
            alert(`Arquivo baixado com sucesso: ${downloadLink.download}`);
            
        } catch (altError) {
            console.error('Método alternativo também falhou:', altError);
            alert('Erro ao exportar dados: ' + error.message);
        }
    }
}

async function exportToXlsx(payload) {
    await ensureXLSX();
    const projectName = payload?.projeto || 'Projeto';
    const timestamp = new Date().toISOString().split('T')[0];

    const rows = [
        ['Project','Generated','Metric','Value','Rating'],
        [projectName, timestamp, 'Bugs', payload?.bugs ?? 0, '-'],
        [projectName, timestamp, 'Vulnerabilities', payload?.vulnerabilidades ?? 0, '-'],
        [projectName, timestamp, 'Code Smells', payload?.code_smells ?? 0, '-'],
        [projectName, timestamp, 'Coverage', payload?.coverage ?? '0%', '-'],
        [projectName, timestamp, 'Duplicated Lines', payload?.duplicacoes ?? '0%', '-'],
    ];

    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    window.XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
    const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}-SonarQube-${timestamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function groupByPeriod(data, period) {
    const buckets = new Map();
    const toKey = (iso) => {
        const d = new Date(iso);
        if (period === 'day') {
            return d.toISOString().slice(0,10);
        }
        if (period === 'week') {
            const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
            const day = dt.getUTCDay() || 7;
            dt.setUTCDate(dt.getUTCDate() - day + 1);
            return dt.toISOString().slice(0,10);
        }
        // month
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    };
    for (const metric of data) {
        for (const point of (metric.history || [])) {
            const key = toKey(point.date);
            if (!buckets.has(key)) buckets.set(key, {});
            buckets.get(key)[metric.metric] = (buckets.get(key)[metric.metric] || []);
            buckets.get(key)[metric.metric].push(Number(point.value));
        }
    }
    return buckets;
}

function aggregate(buckets, agg) {
    const result = [];
    const op = (arr) => {
        if (!arr || arr.length === 0) return 0;
        if (agg === 'min') return Math.min(...arr);
        if (agg === 'max') return Math.max(...arr);
        if (agg === 'avg') return arr.reduce((a,b)=>a+b,0) / arr.length;
        // last
        return arr[arr.length-1];
    };
    const keys = Array.from(buckets.keys()).sort();
    for (const k of keys) {
        const byMetric = buckets.get(k);
        const row = { period: k };
        for (const metric of Object.keys(byMetric)) {
            row[metric] = op(byMetric[metric]);
        }
        result.push(row);
    }
    return result;
}

async function consultarHistorico() {
    const comp = document.getElementById('advComponent').value.trim();
    const metrics = document.getElementById('advMetricKeys').value.trim();
    const from = document.getElementById('advFromDate').value;
    const to = document.getElementById('advToDate').value;
    const groupBy = document.getElementById('advGroupBy').value;
    const agg = document.getElementById('advAgg').value;
    if (!comp) { alert('Component obrigatório'); return; }
    const url = `/api/historico?component=${encodeURIComponent(comp)}&metrics=${encodeURIComponent(metrics)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = await fetch(url);
    if (!res.ok) { alert('Erro ao consultar histórico'); return; }
    const payload = await res.json();
    latestHistory = payload;
    const buckets = groupByPeriod(payload.measures || [], groupBy);
    const grouped = aggregate(buckets, agg);
    const out = document.getElementById('advResult');
    out.style.display = 'block';
    out.textContent = JSON.stringify(grouped, null, 2);
}

function consultarSonarQube() {
    const componentInput = document.getElementById('componentInput');
    const metricKeysInput = document.getElementById('metricKeysInput');
    
    const component = componentInput.value.trim();
    const metricKeys = metricKeysInput.value.trim();
    
    if (!component) {
        alert('Digite o nome do componente');
        return;
    }
    
    if (!metricKeys) {
        alert('Digite as métricas desejadas');
        return;
    }
    
    // Construir URL da API
    const url = `/api/medidas?component=${encodeURIComponent(component)}&metricKeys=${encodeURIComponent(metricKeys)}`;
    
    // Mostrar indicador de carregamento
    showLoading(true);
    
    fetch(url)
        .then((res) => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            return res.json();
        })
        .then((data) => {
            console.log('Dados recebidos:', data);
            updateMetricsFromPayload(data);
            showLoading(false);
        })
        .catch((err) => {
            console.error('Erro na consulta:', err);
            alert(`Erro ao consultar SonarQube: ${err.message}`);
            showLoading(false);
        });
}

function showLoading(show) {
    const queryBtn = document.getElementById('queryBtn');
    if (queryBtn) {
        if (show) {
            queryBtn.textContent = 'Consultando...';
            queryBtn.disabled = true;
        } else {
            queryBtn.textContent = 'Consultar';
            queryBtn.disabled = false;
        }
    }
}

// Inicialização - consultar projeto padrão
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM carregado, inicializando aplicação...');
    
    // Botão de consulta
    const queryBtn = document.getElementById('queryBtn');
    if (queryBtn) {
        console.log('Botão de consulta encontrado:', queryBtn);
        queryBtn.addEventListener('click', consultarSonarQube);
    } else {
        console.error('Botão de consulta não encontrado!');
    }
    
    // Botão de export
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        console.log('Botão de exportação encontrado:', exportBtn);
        
        exportBtn.addEventListener('click', function() {
            console.log('Botão de exportação clicado!');
            
            if (!latestData) {
                console.log('Nenhum dado disponível para exportação');
                alert('Consulte um projeto primeiro usando os campos de configuração');
                return;
            }
            
            console.log('Dados disponíveis para exportação:', latestData);
            
            try {
                // Usar a função de exportação para Excel
                exportToExcel(latestData);
            } catch (error) {
                console.error('Erro na exportação:', error);
                alert('Erro ao exportar dados: ' + error.message);
            }
        });
        
        console.log('Event listener adicionado ao botão de exportação');
    } else {
        console.error('Botão de exportação não encontrado!');
    }

    // Botão de export XLSX
    const exportBtnXlsx = document.getElementById('exportBtnXlsx');
    if (exportBtnXlsx) {
        exportBtnXlsx.addEventListener('click', async function() {
            if (!latestData) {
                alert('Consulte um projeto primeiro usando os campos de configuração');
                return;
            }
            try {
                await exportToXlsx(latestData);
            } catch (e) {
                console.warn('Falha XLSX local, usando fallback backend:', e);
                // fallback: chama backend para gerar .xls compatível
                const comp = latestData.projeto || document.getElementById('componentInput').value.trim();
                const metrics = document.getElementById('metricKeysInput').value.trim() || 'bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density';
                const url = `/api/export/xls?component=${encodeURIComponent(comp)}&metricKeys=${encodeURIComponent(metrics)}`;
                window.location.href = url;
            }
        });
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        console.log('Campo de pesquisa encontrado:', searchInput);
        
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const projeto = this.value;
                if (!projeto) {
                    alert('Digite o nome do projeto');
                    return;
                }
                
                // Usar a nova API
                const url = `/api/medidas?component=${encodeURIComponent(projeto)}&metricKeys=bugs,vulnerabilities,code_smells`;
                
                showLoading(true);
                fetch(url)
                    .then((res) => res.json())
                    .then((data) => {
                        updateMetricsFromPayload(data);
                        showLoading(false);
                    })
                    .catch((err) => {
                        alert(`Erro ao buscar dados: ${err}`);
                        showLoading(false);
                    });
            }
        });
    } else {
        console.error('Campo de pesquisa não encontrado!');
    }
    
    // Modal avançado
    const openBtn = document.getElementById('openQueryMenuBtn');
    const closeBtn = document.getElementById('closeQueryMenuBtn');
    const modal = document.getElementById('queryModal');
    const overlay = document.getElementById('queryModalOverlay');
    const btnRunCurrent = document.getElementById('btnRunCurrent');
    const btnRunHistory = document.getElementById('btnRunHistory');
    const runCurrent = () => {
        const comp = document.getElementById('advComponent').value.trim();
        const metrics = document.getElementById('advMetricKeys').value.trim();
        if (!comp) { alert('Component obrigatório'); return; }
        document.getElementById('componentInput').value = comp;
        document.getElementById('metricKeysInput').value = metrics || 'bugs,vulnerabilities,code_smells';
        consultarSonarQube();
    };
    if (openBtn && modal) {
        openBtn.addEventListener('click', ()=>{ modal.style.display='block'; modal.setAttribute('aria-hidden','false'); });
    }
    if (closeBtn && modal) {
        const closeModal = ()=>{ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); };
        closeBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', closeModal);
    }
    if (btnRunCurrent) btnRunCurrent.addEventListener('click', runCurrent);
    if (btnRunHistory) btnRunHistory.addEventListener('click', consultarHistorico);

    // Consultar projeto padrão ao carregar a página
    setTimeout(() => {
        console.log('Iniciando consulta padrão...');
        consultarSonarQube();
    }, 500);
    
    console.log('Aplicação inicializada com sucesso!');
});
