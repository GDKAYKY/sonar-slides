const form = document.querySelector('form');
const resultado = document.querySelector('#resultado');

let latestData = null;

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
    
    // Consultar projeto padrão ao carregar a página
    setTimeout(() => {
        console.log('Iniciando consulta padrão...');
        consultarSonarQube();
    }, 500);
    
    console.log('Aplicação inicializada com sucesso!');
});
