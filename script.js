// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC-xvM9xOfg8SqdWej2ebMPQ75Im0mXpbc",
    authDomain: "evaluacion-profesores-df107.firebaseapp.com",
    projectId: "evaluacion-profesores-df107",
    storageBucket: "evaluacion-profesores-df107.firebasestorage.app",
    messagingSenderId: "182131194576",
    appId: "1:182131194576:web:fc4b91499a2bc1435cfcd5"
};

// Inicializar Firebase solo una vez
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// URL pública de tu hoja de Google Sheets en formato CSV
const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQa3aGxJT18QCegGY4ol0ZV2n3wBG2gQ_KM2kux_NxUJkvXMF7fIaDe5EVMIH3vUEjDUUoInMkZEW-T/pub?output=csv';

// Variables globales
let evaluations = [];
let gruposPorSemestre = {};
let profesoresPorGrupo = {};
let selectedSemesters = [];
let selectedGroups = [];
let selectedTeachers = [];
let evaluationsFORM = {};
let ALL_TEACHERS = [];
let profesoresSelecionadosBusqueda = new Set();
let agregandoDesdeTeachersSection = false;
let desdeBusquedaDocente = false;
let skeletonTimeout;
let selectedHigherGroups = {};
let gruposSeleccionadosBusqueda = new Set();
let groupsBySemester = {};
let scheduleData = [];
let lastGroup = null;

// Constantes
const CACHE_VALIDITY = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
const API_URL = 'https://us-central1-evaluacion-profesores-df107.cloudfunctions.net/getFormData';

// Elementos DOM comunes
const loadingScreen = document.getElementById('loading-screen');
const semesterSelect = document.getElementById('results-semester');
const groupSelect = document.getElementById('results-group');
const searchInput = document.getElementById('results-search');
const tableBody = document.getElementById('results-table-body');
const commentsModal = document.getElementById('comments-modal');
const closeModal = document.querySelector('.close-modal');
const commentsContainer = document.getElementById('comments-container');
const professorNameElement = document.querySelector('.modal-title');
const lastUpdatedElement = document.getElementById('last-updated');
const statusText = document.getElementById('status-text');

// Función para ocultar la pantalla de carga
function hideLoadingState() {
    console.log("[LOADER] Ocultando pantalla de carga");
    clearTimeout(skeletonTimeout);
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }
    const formContainer = document.getElementById('form-container');
    if (formContainer) {
        formContainer.style.display = 'block';
    }
}

// Función para mostrar error
function showErrorState(error) {
    if (loadingScreen) {
        loadingScreen.innerHTML = `
            <div style="text-align: center; color: red; padding: 20px;">
                <h3>Error al cargar la aplicación</h3>
                <p>${error.message}</p>
                <button onclick="window.location.reload()" 
                        style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Reintentar
                </button>
            </div>
        `;
    }
}

// Inicialización de la aplicación
async function initializeApp() {
    try {
        console.log("Inicializando aplicación...");
        
        // Configurar event listeners para las pestañas
        setupTabListeners();
        
        // Inicializar ambas secciones
        await initializeFormSection();
        await initializeResultsSection();
        
    } catch (error) {
        console.error("Error inicializando la aplicación:", error);
        showErrorState(error);
    } finally {
        // Ocultar pantalla de carga siempre
        hideLoadingState();
    }
}

// Configurar listeners para las pestañas
function setupTabListeners() {
    const tabs = document.querySelectorAll('.app-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            // Remover clase active de todos los tabs y contenidos
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            
            // Agregar clase active al tab y contenido seleccionado
            tab.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Inicializar sección de formulario
async function initializeFormSection() {
    try {
        console.log("Inicializando sección de formulario...");
        await cargarDatos();
        configurarEventListeners();
    } catch (error) {
        console.error("Error inicializando sección de formulario:", error);
        throw error;
    }
}

// Inicializar sección de resultados
async function initializeResultsSection() {
    try {
        console.log("Inicializando sección de resultados...");
        await loadScheduleData();
        setupFirebaseListeners();
        updateLastUpdated();
    } catch (error) {
        console.error("Error inicializando sección de resultados:", error);
        throw error;
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM completamente cargado");
    
    // Configurar listener para el botón de limpiar caché
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            if (confirm('¿Estás seguro de querer limpiar la caché? Se cargarán datos frescos.')) {
                clearCache().then(success => {
                    if (!success) {
                        alert('Ocurrió un error. Por favor recarga la página manualmente.');
                    }
                });
            }
        });
    }
    
    // Inicializar la aplicación
    initializeApp();
});

                                            //FUNCIONES DE INICILIZACION DEL FORMULARIO//
function initSkeletonTimeout() {
    skeletonTimeout = setTimeout(() => {
        if (document.getElementById('loading-screen').style.display === 'flex') {
            document.getElementById('skeleton-container').style.display = 'block';
        }
    }, 1000);
}

// Limpia la caché local del formulario
function clearCache() {
    return new Promise((resolve) => {
        try {
            console.log("[CACHE] Limpiando caché local");
            localStorage.removeItem('formDataCache');
            localStorage.removeItem('formDataCacheTime');
            
            // Limpiar caché del navegador
            if (caches && caches.delete) {
                caches.delete('firebase-firestore')
                    .then(() => console.log("[CACHE] Cache de Firestore limpiada"))
                    .catch(e => console.warn("[CACHE] Error limpiando cache de Firestore:", e));
            }
            
            // Recargar después de 500ms
            setTimeout(() => {
                window.location.reload();
                resolve(true);
            }, 500);
            
        } catch (e) {
            console.error("[CACHE] Error crítico:", e);
            alert("Error grave al limpiar caché. Por favor recarga manualmente.");
            resolve(false);
        }
    });
}

// Funciones auxiliares para la carga
function checkCache() {
    try {
        const cachedData = localStorage.getItem('formDataCache');
        const cacheTime = localStorage.getItem('formDataCacheTime');
        
        if (!cachedData || !cacheTime) return { cachedData: null, isFresh: false };
        
        const parsedData = JSON.parse(cachedData);
        const isFresh = (Date.now() - cacheTime < CACHE_VALIDITY);
        
        // Verificar integridad de los datos en caché
        if (!parsedData.gruposPorSemestre || !parsedData.profesoresPorGrupo) {
            clearCache(); // Limpia si los datos son inválidos
            return { cachedData: null, isFresh: false };
        }
        
        return { cachedData: parsedData, isFresh };
    } catch (e) {
        clearCache(); // Limpia si hay error al parsear
        return { cachedData: null, isFresh: false };
    }
}

async function fetchData() {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Error en la red');
    
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Datos inválidos');
    
    return data;
}

function updateCache(data) {
    try {
        localStorage.setItem('formDataCache', JSON.stringify(data));
        localStorage.setItem('formDataCacheTime', Date.now());
        console.log("Datos actualizados en caché");
        return true;
    } catch (e) {
        console.error("Error actualizando caché:", e);
        return false;
    }
}

function useCachedData(data) {
    return new Promise((resolve, reject) => {
        try {
            console.log("Datos recibidos para cache:", data);
            
            if (!data || !data.gruposPorSemestre || !data.profesoresPorGrupo) {
                throw new Error('Datos en caché no válidos');
            }
            
            gruposPorSemestre = {};
            Object.entries(data.gruposPorSemestre).forEach(([key, value]) => {
                gruposPorSemestre[key.toString()] = value.map(String);
            });

            profesoresPorGrupo = {};
            Object.entries(data.profesoresPorGrupo).forEach(([key, value]) => {
                profesoresPorGrupo[key.toString()] = value.map(String);
            });

            console.log("Datos finales cargados:", { gruposPorSemestre, profesoresPorGrupo });
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// Funciones para manejar la UI de carga
function showLoadingState() {
    const loadingScreen = document.getElementById('loading-screen');
    const formContainer = document.getElementById('form-container');
    
    if (!loadingScreen || !formContainer) {
        console.error('Elementos de carga no encontrados');
        return;
    }
    
    try {
        loadingScreen.style.display = 'flex';
        formContainer.style.display = 'none';
        initSkeletonTimeout();
    } catch (error) {
        console.error('Error mostrando estado de carga:', error);
    }
}

function hideLoadingState() {
    console.log("[LOADER] Ocultando pantalla de carga");
    clearTimeout(skeletonTimeout);
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }
    const formContainer = document.getElementById('form-container');
    if (formContainer) {
        formContainer.style.display = 'block';
    }
}

// Función principal para cargar datos
async function cargarDatos() {
    try {
        console.log("[1] Iniciando carga de datos");
        
        // Verificar caché
        const { cachedData, isFresh } = checkCache();
        console.log("[2] Estado de caché:", { cachedData: !!cachedData, isFresh });
        
        if (cachedData && isFresh) {
            console.log("[3] Usando datos de caché");
            await useCachedData(cachedData);
            if (cachedData.docentes) ALL_TEACHERS = cachedData.docentes;
        } else {
            console.log("[3] Obteniendo datos frescos");
            const data = await fetchData();
            console.log("[4] Datos recibidos:", data);
            updateCache(data);
            await useCachedData(data);
            if (data.docentes) ALL_TEACHERS = data.docentes;
        }
        
        console.log("[5] Configurando listeners");
        configurarEventListeners();
        
    } catch (error) {
        console.error("[ERROR] En cargarDatos:", error);
        showErrorState(error);
    }
}


function showErrorState(error) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.innerHTML = `
            <div style="text-align: center; color: red; padding: 20px;">
                <h3>Error al cargar el formulario</h3>
                <p>${error.message}</p>
                <button onclick="window.location.reload()" 
                        style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Reintentar
                </button>
            </div>
        `;
    }
}

// Función para llenar grupos en columnas
function llenarGruposEnColumnas() { 
    console.log("Llenando grupos... Semestres disponibles:", Object.keys(gruposPorSemestre));
    
    const checks = document.querySelectorAll('input[name="semester"]:checked');
    selectedSemesters = Array.from(checks).map(cb => cb.value);
    console.log("Semestres seleccionados:", selectedSemesters);
    
    if (selectedSemesters.length === 0) {
        console.warn("No hay semestres seleccionados");
        alert('Por favor selecciona al menos un semestre.');
        return false;
    }
    
    const container = document.getElementById('groups-container');
    container.innerHTML = '';
    
    // Separar semestres regulares (1-6) y superiores (7-10)
    const regularSemesters = selectedSemesters.filter(s => s <= 6);
    const higherSemesters = selectedSemesters.filter(s => s > 6);
    
    // Procesar semestres regulares (1-6)
    regularSemesters.forEach(semestre => {
        const grupos = gruposPorSemestre[semestre];
        console.log(`Grupos para semestre ${semestre}:`, grupos);
        
        if (!grupos || grupos.length === 0) {
            console.warn(`No hay grupos para el semestre ${semestre}`);
            return;
        }

        const column = document.createElement('div');
        column.className = 'group-column';
        column.innerHTML = `<h3>Semestre ${semestre}</h3>
                          <div class="group-checkboxes" id="groups-${semestre}"></div>`;
        
        container.appendChild(column);

        grupos.forEach(grupo => {
            console.log(`Añadiendo grupo ${grupo} al semestre ${semestre}`);
            const checkboxId = `group-${semestre}-${grupo.replace(/\s+/g, '-')}`;
            const checkboxHTML = `
                <label class="checkbox-option">
                    <input type="checkbox" name="group" value="${grupo}" id="${checkboxId}">
                    <span class="checkmark"></span>
                    ${grupo}
                </label>`;
            
            document.getElementById(`groups-${semestre}`).insertAdjacentHTML('beforeend', checkboxHTML);
        });
    });
    
    // Procesar semestres superiores (7-10)
    if (higherSemesters.length > 0) {
        const higherContainer = document.createElement('div');
        higherContainer.className = 'higher-semester-container';
        higherContainer.innerHTML = `
            <h3>Busca tus grupos y agregalos: </h3>
            <div class="group-search-container">
                <input type="text" id="search-group-input" placeholder="Buscar grupo...">
                <div id="search-group-results" class="search-results"></div>
            </div>
            <div class="selected-groups" id="selected-groups-container"></div>
        `;
        container.appendChild(higherContainer);
        
        // Configurar búsqueda de grupos
        const searchInput = document.getElementById('search-group-input');
        searchInput.addEventListener('input', function(e) {
    const term = e.target.value.toLowerCase();
    if (term.length < 2) {
        document.getElementById('search-group-results').innerHTML = '';
        return;
    }
    
    let filteredGroups = [];
    higherSemesters.forEach(sem => {
        const grupos = gruposPorSemestre[sem] || [];
        grupos.forEach(group => {
            if (group.toLowerCase().includes(term)) {
                filteredGroups.push({
                    semestre: sem,
                    nombre: group
                });
            }
        });
    });
    
    renderGroupSearchResults(filteredGroups);
});
        
        // Renderizar grupos ya seleccionados
        renderSelectedHigherGroups();
    }
    
    return true;
}

// Renderizar resultados de búsqueda de grupos
function renderGroupSearchResults(groups) {
    const resultsContainer = document.getElementById('search-group-results');
    resultsContainer.innerHTML = '';
    
    if (groups.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No se encontraron grupos</div>';
        return;
    }
    
    groups.forEach(group => {
        const isSelected = gruposSeleccionadosBusqueda.has(`${group.semestre}-${group.nombre}`);
        const html = `
            <div class="inline-search-result">
                <span>${group.nombre} (Sem ${group.semestre})</span>
                <button class="btn-add" 
                        data-sem="${group.semestre}" 
                        data-group="${group.nombre}">
                    ${isSelected ? '<i class="fas fa-check"></i> Seleccionado' : '<i class="fas fa-plus"></i> Agregar'}
                </button>
            </div>
        `;
        resultsContainer.insertAdjacentHTML('beforeend', html);
    });
    
    // Agregar event listeners
    document.querySelectorAll('.btn-add').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sem = e.target.dataset.sem;
            const group = e.target.dataset.group;
            addSelectedGroup(sem, group);
            
            // Ocultar resultados después de agregar
            document.getElementById('search-group-results').innerHTML = '';
            document.getElementById('search-group-input').value = '';
        });
    });
}


// Agregar grupo seleccionado
function addSelectedGroup(semestre, grupo) {
    const key = `${semestre}-${grupo}`;
    
    if (!gruposSeleccionadosBusqueda.has(key)) {
        gruposSeleccionadosBusqueda.add(key);
        
        if (!selectedHigherGroups[semestre]) {
            selectedHigherGroups[semestre] = [];
        }
        
        if (!selectedHigherGroups[semestre].includes(grupo)) {
            selectedHigherGroups[semestre].push(grupo);
        }
        
        renderSelectedHigherGroups();
        
        // Animación de confirmación
        const container = document.getElementById('selected-groups-container');
        if (container) {
            container.classList.add('highlight');
            setTimeout(() => {
                container.classList.remove('highlight');
            }, 2000);
        }
    }
}

// Eliminar grupo seleccionado
function removeSelectedGroup(semestre, grupo) {
    const key = `${semestre}-${grupo}`;
    
    if (gruposSeleccionadosBusqueda.has(key)) {
        gruposSeleccionadosBusqueda.delete(key);
        
        if (selectedHigherGroups[semestre]) {
            selectedHigherGroups[semestre] = selectedHigherGroups[semestre].filter(g => g !== grupo);
            
            if (selectedHigherGroups[semestre].length === 0) {
                delete selectedHigherGroups[semestre];
            }
        }
        
        renderSelectedHigherGroups();
    }
}

// Renderizar grupos seleccionados
function renderSelectedHigherGroups() {
    const container = document.getElementById('selected-groups-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.keys(selectedHigherGroups).forEach(semestre => {
        selectedHigherGroups[semestre].forEach(grupo => {
            const groupItem = document.createElement('div');
            groupItem.className = 'selected-group-item';
            groupItem.innerHTML = `
                ${grupo} (Sem ${semestre})
                <button class="remove-group" 
                        data-sem="${semestre}" 
                        data-group="${grupo}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(groupItem);
            
            // Evento para eliminar
            groupItem.querySelector('.remove-group').addEventListener('click', (e) => {
                const sem = e.target.closest('button').dataset.sem;
                const grp = e.target.closest('button').dataset.group;
                removeSelectedGroup(sem, grp);
            });
        });
    });
}

// Obtener todos los grupos seleccionados (para usar en otras funciones)
function getAllSelectedGroups() {
    // Grupos de semestres regulares (1-6)
    const regularChecks = document.querySelectorAll('input[name="group"]:checked');
    const regularGroups = Array.from(regularChecks).map(cb => cb.value);
    
    // Grupos de semestres superiores (7-10)
    let higherGroups = [];
    Object.values(selectedHigherGroups).forEach(groups => {
        higherGroups = higherGroups.concat(groups);
    });
    
    return [...regularGroups, ...higherGroups];
}

// Función para llenar profesores con checkboxes
function llenarProfesoresCheckboxes() {
  const container = document.getElementById('teachers-container');
  container.innerHTML = '';
  
  // Obtener TODOS los grupos seleccionados (1-6mo y 7-10mo)
  selectedGroups = getAllSelectedGroups();
  
  if (selectedGroups.length === 0) {
    alert('Por favor selecciona al menos un grupo.');
    return false;
  }
  
  // Recolectar profesores únicos
  let profesoresUnicos = new Set();
  let gruposSinProfesores = [];
  
  selectedGroups.forEach(grupo => {
    if (!profesoresPorGrupo[grupo] || profesoresPorGrupo[grupo].length === 0) {
      gruposSinProfesores.push(grupo);
      return;
    }
    
    profesoresPorGrupo[grupo].forEach(profesor => {
      profesoresUnicos.add(profesor);
    });
  });
  
  if (profesoresUnicos.size === 0) {
    alert(`Los siguientes grupos no tienen profesores asignados: ${gruposSinProfesores.join(', ')}`);
    return false;
  }
  
  // Crear checkboxes para cada profesor
  Array.from(profesoresUnicos).sort().forEach(profesor => {
    const checkboxHTML = `
      <label class="checkbox-option">
        <input type="checkbox" name="teacher" value="${profesor}">
        <span class="checkmark"></span>
        ${profesor}
      </label>`;
    container.insertAdjacentHTML('beforeend', checkboxHTML);
  });
  
  // Botón de búsqueda integrado - MODIFICADO para mejor manejo de eventos
  const searchButtonHTML = `
    <div class="inline-search-container">
  <button type="button" id="show-inline-search" class="btn-search">
    <i class="fas fa-search"></i> Buscar más docentes
  </button>
  <div class="inline-search-box" id="inline-search-box">
    <input type="text" id="inline-search-input" placeholder="Buscar docente...">
    <div id="inline-search-results" class="inline-search-results"></div>
  </div>
</div>`;

  container.insertAdjacentHTML('beforeend', searchButtonHTML);
  
  // Configurar eventos de búsqueda - AÑADIDO
  setupTeacherSearchEvents();
  
  return true;
}

// Nueva función para configurar los eventos de búsqueda
function setupTeacherSearchEvents() {
  const searchButton = document.getElementById('show-inline-search');
  const searchInput = document.getElementById('inline-search-input');
  
  if (searchButton) {
    searchButton.addEventListener('click', toggleInlineSearch);
  }
  
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const nombre = e.target.value;
      if (nombre.length > 1) {
        renderizarResultadosInline(filtrarProfesoresInline(nombre));
      } else {
        const results = document.getElementById('inline-search-results');
        if (results) results.innerHTML = '';
      }
    });
  }
}

// Función auxiliar para obtener todos los grupos seleccionados (1-6mo y 7-10mo)
function getAllSelectedGroups() {
  // 1. Grupos de semestres regulares (1-6mo) - de checkboxes normales
  const regularChecks = document.querySelectorAll('input[name="group"]:checked');
  const regularGroups = Array.from(regularChecks).map(cb => cb.value);
  
  // 2. Grupos de semestres superiores (7-10mo) - del sistema de búsqueda
  let higherGroups = [];
  Object.values(selectedHigherGroups).forEach(groups => {
    higherGroups = higherGroups.concat(groups);
  });
  
  // Combinar ambos tipos
  return [...regularGroups, ...higherGroups];
}

//NUEVO:Función para mostrar/ocultar la barra de búsqueda integrada
function toggleInlineSearch() {
  console.log('Elementos:', {
  searchBox: document.getElementById('inline-search-box'),
  searchButton: document.getElementById('show-inline-search'),
  searchInput: document.getElementById('inline-search-input')
});

document.getElementById('show-inline-search').addEventListener('click', function(e) {
  console.log('Botón clickeado', e);
  e.stopPropagation();
});

  const searchBox = document.getElementById('inline-search-box');
  const searchButton = document.getElementById('show-inline-search');
  const searchInput = document.getElementById('inline-search-input');
  
  if (!searchBox || !searchButton) {
    console.error('Elementos de búsqueda no encontrados');
    return;
  }
  
  if (searchBox.classList.contains('visible')) {
    // Ocultar búsqueda
    searchBox.classList.remove('visible');
    searchButton.innerHTML = '<i class="fas fa-search"></i> Buscar más docentes';
    document.getElementById('inline-search-results').innerHTML = '';
    if (searchInput) searchInput.value = '';
  } else {
    // Mostrar búsqueda
    searchBox.classList.add('visible');
    searchButton.innerHTML = '<i class="fas fa-times"></i> Cancelar búsqueda';
    setTimeout(() => {
      if (searchInput) searchInput.focus();
    }, 50);
  }
}


// NUEVO: Función para filtrar profesores en búsqueda integrada
function filtrarProfesoresInline(nombre) {
  // Obtener los docentes ya mostrados en la sección principal
  const teachersContainer = document.getElementById('teachers-container');
  const yaMostrados = Array.from(teachersContainer.querySelectorAll('input[name="teacher"]')).map(cb => cb.value);

  // Filtrar en la lista global, excluyendo los ya mostrados
  return ALL_TEACHERS
    .filter(p => p.toLowerCase().includes(nombre.toLowerCase()))
    .filter(p => !yaMostrados.includes(p));
}

// NUEVO: Renderizar resultados de búsqueda integrada
function renderizarResultadosInline(profesores) {
  const results = document.getElementById('inline-search-results');
  results.innerHTML = '';

  if (profesores.length === 0) {
    results.innerHTML = '<div class="no-results">No se encontraron docentes.</div>';
    return;
  }

  profesores.forEach(profesor => {
    const html = `
      <div class="inline-search-result">
        <span>${profesor}</span>
        <button class="btn-add" data-teacher="${profesor}">
          <i class="fas fa-plus"></i> Agregar
        </button>
      </div>
    `;
    results.insertAdjacentHTML('beforeend', html);
  });

  // Agregar listeners a los botones
  Array.from(results.querySelectorAll('.btn-add')).forEach(btn => {
    btn.addEventListener('click', (e) => {
      const profesor = e.target.dataset.teacher || e.target.parentElement.dataset.teacher;
      agregarProfesorDesdeBusqueda(profesor);
    });
  });
}

// NUEVO: Función para agregar un docente desde la búsqueda
function agregarProfesorDesdeBusqueda(profesor) {
  const container = document.getElementById('teachers-container');
  
  // Verificar si ya existe
  if (container.querySelector(`input[value="${profesor}"]`)) {
    return;
  }
  
  // Agregar checkbox
  const checkboxHTML = `
    <label class="checkbox-option">
      <input type="checkbox" name="teacher" value="${profesor}" checked>
      <span class="checkmark"></span>
      ${profesor}
    </label>`;
  
  // Insertar antes del contenedor de búsqueda
  container.insertAdjacentHTML('beforeend', checkboxHTML);
  
  // Marcar como seleccionado
  selectedTeachers.push(profesor);
  
  // Animación de confirmación
  const addedElement = container.lastElementChild.previousElementSibling;
  addedElement.classList.add('highlight');
  setTimeout(() => {
    addedElement.classList.remove('highlight');
  }, 2000);
  
  // Cerrar la búsqueda y limpiar
  toggleInlineSearch();
  document.getElementById('inline-search-input').value = '';
}

// Función para crear evaluaciones
function crearEvaluaciones() {
  const container = document.getElementById('evaluation-items');
  container.innerHTML = '';

  // MODIFICADO: Usar selección de búsqueda si está activa
  let profesoresParaEvaluar;
  if (profesoresSeleccionadosBusqueda && profesoresSeleccionadosBusqueda.size > 0) {
    profesoresParaEvaluar = Array.from(profesoresSeleccionadosBusqueda);
    selectedTeachers = profesoresParaEvaluar;
  } else {
    // Obtener profesores seleccionados de los checkboxes normales
    const checks = document.querySelectorAll('input[name="teacher"]:checked');
    profesoresParaEvaluar = Array.from(checks).map(cb => cb.value);
    selectedTeachers = profesoresParaEvaluar;
  }

  if (profesoresParaEvaluar.length === 0) {
    alert('Por favor selecciona al menos un docente.');
    return false;
  }

  // Crear sección de evaluación para cada profesor
  profesoresParaEvaluar.forEach(profesor => {
    evaluationsFORM[profesor] = { rating: null, comments: '' };
    const evaluationHTML = `
      <div class="evaluation-item">
        <h3>Evaluación para: ${profesor}</h3>
        <label class="required">Calificación: Asigna una calificación según la escala:<br>
          <span class="rating-scale-description">
            1=Nada recomendado &nbsp;&nbsp; 2=Hay mejores &nbsp;&nbsp; 3=Neutral &nbsp;&nbsp; 4=Bueno &nbsp;&nbsp; 5=Totalmente recomendado
          </span>
        </label>
        <div class="rating-scale">
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-1" name="${profesor}-rating" value="1">
            <label for="${profesor}-rating-1">1</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-2" name="${profesor}-rating" value="2">
            <label for="${profesor}-rating-2">2</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-3" name="${profesor}-rating" value="3">
            <label for="${profesor}-rating-3">3</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-4" name="${profesor}-rating" value="4">
            <label for="${profesor}-rating-4">4</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-5" name="${profesor}-rating" value="5">
            <label for="${profesor}-rating-5">5</label>
          </div>
        </div>
        <label for="${profesor}-comments">Comentarios adicionales:</label>
        <textarea id="${profesor}-comments" rows="4" placeholder="Escribe aqui tu opinion o recomendación del docente..."></textarea>
      </div>`;
    container.insertAdjacentHTML('beforeend', evaluationHTML);
  });

  // --- NUEVO: Botones alineados a los extremos ---
  const evalSection = document.getElementById('evaluation-section');
  if (evalSection) {
    // Elimina cualquier contenedor anterior de botones de envío
    let oldBtnContainer = evalSection.querySelector('.navigation-buttons');
    if (oldBtnContainer) oldBtnContainer.remove();

    // Crear contenedor de navegación de botones alineados a los extremos
    const navBtns = document.createElement('div');
    navBtns.className = 'navigation-buttons';
    navBtns.style.display = 'flex';
    navBtns.style.justifyContent = 'space-between';
    navBtns.style.alignItems = 'center';
    navBtns.style.marginTop = '24px';

    // Botón "Anterior"
    let backBtn = document.getElementById('back-to-teachers');
    if (backBtn) backBtn.remove(); // Elimina si ya existe para evitar duplicados
    backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.id = 'back-to-teachers';
    backBtn.textContent = 'Anterior';
    navBtns.appendChild(backBtn);

    // Botón "Enviar evaluación"
    let submitBtn = document.getElementById('submit-form');
    if (submitBtn) submitBtn.remove();
    submitBtn = document.createElement('button');
    submitBtn.id = 'submit-form';
    submitBtn.type = 'button';
    submitBtn.className = 'btn-primary';
    submitBtn.innerHTML = 'Enviar evaluación';
    navBtns.appendChild(submitBtn);

    // Agrega el contenedor de botones al final de la sección
    evalSection.appendChild(navBtns);

    // Ocultar el botón "next-to-contact" si existe
    const nextBtn = document.getElementById('next-to-contact');
    if (nextBtn) nextBtn.style.display = 'none';

    // Listener del botón "Enviar evaluación"
    submitBtn.onclick = async () => {
      // Validar que todos los docentes estén calificados
      let allRated = true;
      let unratedTeachers = [];

      selectedTeachers.forEach(teacher => {
        const rating = document.querySelector(`input[name="${teacher}-rating"]:checked`);
        if (!rating) {
          allRated = false;
          unratedTeachers.push(teacher);
          return;
        }
        evaluationsFORM[teacher].rating = rating.value;
        evaluationsFORM[teacher].comments = document.getElementById(`${teacher}-comments`).value;
      });

      if (!allRated) {
        alert(`Por favor califica a todos los docentes. Faltan: ${unratedTeachers.join(', ')}`);
        return;
      }

      try {
        if (!db) {
          throw new Error("Firestore no está inicializado. Recarga la página.");
        }

        const formData = {
          semestres: selectedSemesters,
          grupos: selectedGroups,
          docentes: selectedTeachers.map(teacher => ({
            nombre: teacher,
            calificacion: evaluationsFORM[teacher].rating,
            comentarios: evaluationsFORM[teacher].comments
          })),
          contacto: {},
          fecha: firebase.firestore.FieldValue.serverTimestamp()
        };

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        await db.collection('evaluaciones').add(formData);

        const hideSection = id => {
          const section = document.getElementById(id);
          if (section) section.classList.add('hidden');
        };
        const showSection = id => {
          const section = document.getElementById(id);
          if (section) section.classList.remove('hidden');
        };
        hideSection('evaluation-section');
        showSection('confirmation-section');

      } catch (error) {
        console.error("Error al enviar:", error);
        alert("Error al enviar evaluación: " + (error.message || "Ver consola para detalles"));
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Enviar evaluación';
      }
    };

    // Listener del botón "Anterior"
    backBtn.onclick = function() {
      const hideSection = id => {
        const section = document.getElementById(id);
        if (section) section.classList.add('hidden');
      };
      const showSection = id => {
        const section = document.getElementById(id);
        if (section) section.classList.remove('hidden');
      };
      hideSection('evaluation-section');
      showSection('teachers-section');
      hideSection('search-teachers-section');
      desdeBusquedaDocente = false;
    };
  }

  return true;
}

// NUEVO: Mantener selección de profesores en búsqueda
let profesoresSeleccionadosBusqueda = new Set();

// NUEVO: Mostrar sección de búsqueda de profesores
function mostrarBusquedaProfesores() {
    const section = document.getElementById('search-teachers-section');
    const input = document.getElementById('search-teacher-input');
    const results = document.getElementById('search-teacher-results');
    section.classList.remove('hidden');
    results.innerHTML = '';
    input.value = '';
    if (!agregandoDesdeTeachersSection) {
        profesoresSeleccionadosBusqueda = new Set();
    }
}

// NUEVO: Filtrar profesores por nombre
function filtrarProfesoresPorNombre(nombre) {
    // Obtener los docentes ya mostrados en la sección principal
    const teachersContainer = document.getElementById('teachers-container');
    const yaMostrados = Array.from(teachersContainer.querySelectorAll('input[name="teacher"]')).map(cb => cb.value);

    // Filtrar en la lista global, excluyendo los ya mostrados
    return ALL_TEACHERS
        .filter(p => p.toLowerCase().includes(nombre.toLowerCase()))
        .filter(p => !yaMostrados.includes(p));
}

// MODIFICADO: Renderizar resultados de búsqueda
function renderizarResultadosBusqueda(profesores) {
    const results = document.getElementById('search-teacher-results');
    results.innerHTML = '';

    if (profesores.length === 0) {
        results.innerHTML = '<span>No se encontraron docentes.</span>';
        return;
    }

    profesores.forEach(profesor => {
        const checkboxId = `search-teacher-${profesor.replace(/\s+/g, '-')}`;
        const checked = profesoresSeleccionadosBusqueda.has(profesor) ? 'checked' : '';
        const html = `
            <label class="checkbox-option">
                <input type="checkbox" name="search-teacher" value="${profesor}" id="${checkboxId}" ${checked}>
                <span class="checkmark"></span>
                ${profesor}
            </label>
        `;
        results.insertAdjacentHTML('beforeend', html);
    });

    // Listeners para actualizar el set
    Array.from(results.querySelectorAll('input[type="checkbox"][name="search-teacher"]')).forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (e.target.checked) {
                profesoresSeleccionadosBusqueda.add(e.target.value);
            } else {
                profesoresSeleccionadosBusqueda.delete(e.target.value);
            }
        });
    });
}

// Configuración de event listeners
function configurarEventListeners() {
  // Función para agregar listeners de forma segura
  function safeAddListener(id, event, handler) {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener(event, handler);
    } else {
      console.warn(`No se agregó listener a ${id} - elemento no encontrado`);
    }
  }

  // Función para mostrar/ocultar secciones
  function showSection(id) {
    const section = document.getElementById(id);
    if (section) section.classList.remove('hidden');
  }

  function hideSection(id) {
    const section = document.getElementById(id);
    if (section) section.classList.add('hidden');
  }

  // Event delegation para la búsqueda integrada
  const teachersContainer = document.getElementById('teachers-container');
  if (teachersContainer) {
    teachersContainer.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'show-inline-search') {
        toggleInlineSearch();
      }
    });

    teachersContainer.addEventListener('input', function(e) {
      if (e.target && e.target.id === 'inline-search-input') {
        const nombre = e.target.value;
        if (nombre.length > 1) {
          renderizarResultadosInline(filtrarProfesoresInline(nombre));
        } else {
          const results = document.getElementById('inline-search-results');
          if (results) results.innerHTML = '';
        }
      }
    });
  }

  // Navegación entre secciones
  safeAddListener('next-to-groups', 'click', () => {
    if (llenarGruposEnColumnas()) {
      hideSection('semesters-section');
      showSection('groups-section');
    }
  });

  safeAddListener('back-to-semesters', 'click', () => {
    hideSection('groups-section');
    showSection('semesters-section');
  });

  safeAddListener('next-to-teachers', 'click', () => {
    // Verificar que se seleccionaron grupos en semestres superiores
    if (selectedSemesters.some(s => s > 6)) {
        const higherSelected = getAllSelectedGroups().length > 0;
        if (!higherSelected) {
            alert('Por favor selecciona al menos un grupo de los semestres superiores');
            return;
        }
    }
    if (llenarProfesoresCheckboxes()) {
      hideSection('groups-section');
      showSection('teachers-section');
    }
  });

  safeAddListener('back-to-groups', 'click', () => {
    hideSection('teachers-section');
    showSection('groups-section');
  });

  safeAddListener('next-to-evaluation', 'click', () => {
    if (crearEvaluaciones()) {
      hideSection('teachers-section');
      showSection('evaluation-section');
    }
  });

  safeAddListener('back-to-teachers', 'click', () => {
    hideSection('evaluation-section');
    showSection('teachers-section');
    hideSection('search-teachers-section');
    desdeBusquedaDocente = false;
  });

  safeAddListener('clear-cache-btn', 'click', () => {
    if (confirm('¿Estás seguro de querer limpiar la caché? Se cargarán datos frescos.')) {
      clearCache().then(success => {
        if (!success) {
          alert('Ocurrió un error. Por favor recarga la página manualmente.');
        }
      });
    }
  });
  // Nuevo: Listener para enviar formulario directamente desde la sección de evaluación
  safeAddListener('submit-form', 'click', async () => {
    // Validar que todos los docentes estén calificados
    let allRated = true;
    let unratedTeachers = [];

    selectedTeachers.forEach(teacher => {
      const rating = document.querySelector(`input[name="${teacher}-rating"]:checked`);
      if (!rating) {
        allRated = false;
        unratedTeachers.push(teacher);
        return;
      }
      evaluationsFORM[teacher].rating = rating.value;
      evaluationsFORM[teacher].comments = document.getElementById(`${teacher}-comments`).value;
    });

    if (!allRated) {
      alert(`Por favor califica a todos los docentes. Faltan: ${unratedTeachers.join(', ')}`);
      return;
    }

    try {
      if (!db) {
        throw new Error("Firestore no está inicializado. Recarga la página.");
      }

      // Construir objeto de datos
      const formData = {
        semestres: selectedSemesters,
        grupos: selectedGroups,
        docentes: selectedTeachers.map(teacher => ({
          nombre: teacher,
          calificacion: evaluationsFORM[teacher].rating,
          comentarios: evaluationsFORM[teacher].comments
        })),
        contacto: {}, // Ya no se pide email
        fecha: firebase.firestore.FieldValue.serverTimestamp()
      };

      // Mostrar estado de carga
      const submitBtn = document.getElementById('submit-form');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
      }

      // Guardar en Firestore
      await db.collection('evaluaciones').add(formData);

      // Mostrar agradecimientos
      hideSection('evaluation-section');
      showSection('confirmation-section');

    } catch (error) {
      console.error("Error al enviar:", error);
      alert("Error al enviar evaluación: " + (error.message || "Ver consola para detalles"));
    } finally {
      const submitBtn = document.getElementById('submit-form');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Enviar evaluación';
      }
    }
  });

  // Búsqueda avanzada - solo si los elementos existen
  safeAddListener('go-to-search-teachers', 'click', () => {
    mostrarBusquedaProfesores();
    hideSection('semesters-section');
    showSection('search-teachers-section');
    renderizarResultadosBusqueda([]);
    desdeBusquedaDocente = false;
  });

  safeAddListener('search-teacher-input', 'input', (e) => {
    const nombre = e.target.value;
    renderizarResultadosBusqueda(filtrarProfesoresPorNombre(nombre));
  });

  safeAddListener('add-teacher-by-search', 'click', () => {
    mostrarBusquedaProfesores();
    hideSection('teachers-section');
    showSection('search-teachers-section');
    renderizarResultadosBusqueda([]);
    desdeBusquedaDocente = true;
  });

  // Listener unificado mejorado
  const confirmSearchBtn = document.getElementById('confirm-search-teachers');
  if (confirmSearchBtn) {
    const handler = function() {
      const checkboxes = document.querySelectorAll('#search-teacher-results input[name="search-teacher"]');
      checkboxes.forEach(cb => {
        if (cb.checked) {
          profesoresSeleccionadosBusqueda.add(cb.value);
        } else {
          profesoresSeleccionadosBusqueda.delete(cb.value);
        }
      });

      const seleccionados = Array.from(profesoresSeleccionadosBusqueda);
      if (seleccionados.length === 0) {
        alert('Selecciona al menos un docente para continuar.');
        return;
      }

      if (desdeBusquedaDocente) {
        const container = document.getElementById('teachers-container');
        if (container) {
          seleccionados.forEach(profesor => {
            if (!container.querySelector(`input[value="${profesor}"]`)) {
              const checkboxHTML = `
                <label class="checkbox-option">
                  <input type="checkbox" name="teacher" value="${profesor}" checked>
                  <span class="checkmark"></span>
                  ${profesor}
                </label>`;
              container.insertAdjacentHTML('beforeend', checkboxHTML);
            }
          });
          
          selectedTeachers = Array.from(container.querySelectorAll('input[name="teacher"]:checked'))
            .map(cb => cb.value);
        }
        
        hideSection('search-teachers-section');
        showSection('teachers-section');
      } else {
        selectedTeachers = seleccionados;
        if (crearEvaluaciones()) {
          hideSection('search-teachers-section');
          showSection('evaluation-section');
        }
      }

      const searchInput = document.getElementById('search-teacher-input');
      if (searchInput) searchInput.value = '';
      
      const searchResults = document.getElementById('search-teacher-results');
      if (searchResults) searchResults.innerHTML = '';
      
      profesoresSeleccionadosBusqueda.clear();
      desdeBusquedaDocente = false;
    };

    confirmSearchBtn.addEventListener('click', handler);
  }
}

// Función de validación de email
function validateEmail(email) {
  if (!email) return true; // Email es opcional
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

                                                // FUNCIONES DE TODO EL RESULTADO //
// Función para configurar los listeners de Firestore
function setupFirebaseListeners() {
    const evaluationsRef = db.collection('evaluaciones');

    evaluationsRef.onSnapshot((snapshot) => {
        evaluations = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Recorre el array de docentes
            if (Array.isArray(data.docentes)) {
                data.docentes.forEach((docente, idx) => {
                    evaluations.push({
                        professor: docente.nombre || '',
                        rating: parseFloat(docente.calificacion) || 0,
                        comment: docente.comentarios || '',
                        // Puedes agregar más campos si los necesitas
                        timestamp: data.fecha ? new Date(data.fecha.seconds * 1000) : Date.now(),
                        // Si quieres asociar grupo/semestre, puedes extraerlos así:
                        group: Array.isArray(data.grupos) ? data.grupos[idx] : '',
                        semester: Array.isArray(data.semestres) ? data.semestres[idx] : ''
                    });
                });
            }
        });

        filterData();
        updateLastUpdated();

        statusText.textContent = "Datos actualizados en tiempo real";
        statusText.style.color = "#2ecc71";
        setTimeout(() => {
            statusText.textContent = "Conectado - Esperando actualizaciones";
            statusText.style.color = "#3498db";
        }, 3000);
    }, (error) => {
        console.error("Error en Firestore listener:", error);
        statusText.textContent = "Error de conexión - Intentando reconectar";
        statusText.style.color = "#e74c3c";
    });
}

// Función para cargar datos desde Google Sheets
async function loadScheduleData() {
    try {
        statusText.textContent = "Cargando datos desde Google Sheets...";
        statusText.style.color = "#f39c12";

        const response = await fetch(GOOGLE_SHEETS_URL);
        const csvData = await response.text();

        // Convertir CSV a JSON
        const jsonData = csvToJson(csvData);
        scheduleData = jsonData;

        // Generar grupos por semestre
        generateGroupsBySemester();

        // Actualizar opciones de grupos
        updateGroupOptions();

        // Mostrar datos iniciales
        filterData();

        statusText.textContent = "Conectado - Datos cargados correctamente";
        statusText.style.color = "#2ecc71";

        return true;
    } catch (error) {
        console.error('Error al cargar los datos:', error);
        statusText.textContent = "Error al cargar datos - Intente recargar la página";
        statusText.style.color = "#e74c3c";

        // Mostrar mensaje de error en la tabla
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 30px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                    <h3>Error al cargar los datos</h3>
                    <p>No se pudo cargar la información desde Google Sheets. Por favor, intente recargar la página.</p>
                </td>
            </tr>
        `;

        return false;
    }
}

// Función para convertir CSV a JSON
function csvToJson(csv) {
    const lines = csv.split('\n');
    const result = [];
    const headers = lines[0].split(',').map(h => h.trim());

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;

        const obj = {};
        const currentline = lines[i].split(',');

        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = currentline[j] ? currentline[j].trim() : '';
        }

        result.push(obj);
    }

    return result;
}

// Función para determinar la clase de rating según la puntuación
function getRatingClass(rating) {
    if (rating >= 4.0) return 'rating-high';
    if (rating >= 2.5) return 'rating-medium';
    return 'rating-low';
}

// Función para formatear la fecha
function formatDate(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Hace unos segundos';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} minutos`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
    return `Hace ${Math.floor(diff / 86400)} días`;
}

// Función para actualizar el tiempo de última actualización
function updateLastUpdated() {
    const now = new Date();
    lastUpdatedElement.textContent = formatDate(now);
}

// Función para calcular el promedio y comentarios de un profesor
function calculateProfessorStats(professorName) {
    const professorEvaluations = evaluations.filter(e => e.professor === professorName);

    if (professorEvaluations.length === 0) {
        return { rating: 0, comments: [] };
    }

    const totalRating = professorEvaluations.reduce((sum, evaluation) => sum + evaluation.rating, 0);
    const averageRating = totalRating / professorEvaluations.length;

    // Recolectar todos los comentarios
    const comments = professorEvaluations
        .filter(e => e.comment && e.comment.trim() !== '')
        .map(e => ({
            text: e.comment,
            date: e.timestamp ? formatDate(new Date(e.timestamp)) : 'Fecha desconocida'
        }));

    return {
        rating: averageRating,
        comments: comments
    };
}

// Función para generar grupos por semestre
function generateGroupsBySemester() {
    groupsBySemester = {};

    scheduleData.forEach(item => {
        const semester = item.Semestre || item.semester;
        const group = item.Grupo || item.group;

        if (!groupsBySemester[semester]) {
            groupsBySemester[semester] = new Set();
        }

        groupsBySemester[semester].add(group);
    });
}

// Función para actualizar la lista de grupos
function updateGroupOptions() {
    const semester = semesterSelect.value;
    groupSelect.innerHTML = '<option value="">Todos los grupos</option>';

    if (semester && groupsBySemester[semester]) {
        const groups = Array.from(groupsBySemester[semester]).sort();

        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group;
            option.textContent = `Grupo ${group}`;
            groupSelect.appendChild(option);
        });
    }
}

// Función para combinar datos de horario y evaluaciones
function combineScheduleAndEvaluations() {
    const combinedData = [];

    scheduleData.forEach(scheduleItem => {
        const professor = scheduleItem.Profesor || scheduleItem.professor;
        const stats = calculateProfessorStats(professor);

        combinedData.push({
            semester: scheduleItem.Semestre || scheduleItem.semester,
            group: scheduleItem.Grupo || scheduleItem.group,
            subject: scheduleItem.Asignatura || scheduleItem.subject,
            professor: professor,
            rating: stats.rating,
            comments: stats.comments,
            schedule: {
                monday: scheduleItem.Lunes || scheduleItem.monday,
                tuesday: scheduleItem.Martes || scheduleItem.tuesday,
                wednesday: scheduleItem.Miercoles || scheduleItem.wednesday,
                thursday: scheduleItem.Jueves || scheduleItem.thursday,
                friday: scheduleItem.Viernes || scheduleItem.friday
            }
        });
    });

    return combinedData;
}

// Función para renderizar la tabla con divisores de grupo
function renderTable(data) {
    tableBody.innerHTML = '';
    lastGroup = null; // Reiniciar para cada renderizado

    if (data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 30px;">
                    <i class="fas fa-info-circle" style="font-size: 3rem; color: #3498db; margin-bottom: 15px;"></i>
                    <h3 style="color: #333;">No se encontraron resultados</h3>
                    <p style="color: #666;">Intenta con otros filtros o términos de búsqueda</p>
                </td>
            </tr>
        `;
        return;
    }

    data.forEach(item => {
        const ratingClass = getRatingClass(item.rating);

        // Agregar divisor si cambió el grupo
        if (lastGroup !== null && lastGroup !== item.group) {
            const dividerRow = document.createElement('tr');
            dividerRow.className = 'group-divider';
            dividerRow.innerHTML = `<td colspan="9"></td>`;
            tableBody.appendChild(dividerRow);
        }

        lastGroup = item.group;

        const row = document.createElement('tr');

        // Aplicar color de fondo según el rating
        if (item.rating === 0) {
    row.style.backgroundColor = ''; // Fondo blanco (elimina cualquier estilo previo)
            } else if (item.rating >= 4.0) {
    row.style.backgroundColor = 'rgba(46, 204, 113, 0.1)';
            } else if (item.rating >= 2.5) {
    row.style.backgroundColor = 'rgba(243, 156, 18, 0.1)';
            } else if (item.rating >= 0.1) {
    row.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
            } else {
    // Para valores menores a 0.1 (incluyendo negativos) o undefined
    row.style.backgroundColor = ''; // Fondo blanco
        }

        row.innerHTML = `
            <td>${item.group}</td>
            <td>${item.subject}</td>
            <td class="professor-cell" data-professor="${item.professor}">
                <i class="fas fa-user-graduate"></i> ${item.professor}
            </td>
            <td>
                <span class="rating ${ratingClass}">${item.rating.toFixed(1)}</span>
            </td>
            <td class="day-cell mon">${item.schedule.monday || '-'}</td>
            <td class="day-cell tue">${item.schedule.tuesday || '-'}</td>
            <td class="day-cell wed">${item.schedule.wednesday || '-'}</td>
            <td class="day-cell thu">${item.schedule.thursday || '-'}</td>
            <td class="day-cell fri">${item.schedule.friday || '-'}</td>
        `;

        tableBody.appendChild(row);
    });

    // Agregar event listeners a las celdas de profesor
    document.querySelectorAll('.professor-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            const professor = cell.getAttribute('data-professor');
            showComments(professor);
        });
    });
}

// Función para mostrar los comentarios
function showComments(professor) {
    const stats = calculateProfessorStats(professor);

    professorNameElement.textContent = `Comentarios sobre ${professor}`;

    if (stats.comments.length > 0) {
        let commentsHTML = '<ul class="comments-list">';

        stats.comments.forEach(comment => {
            commentsHTML += `
                <li class="comment-item">
                    <div class="comment-header">
                        <span><i class="far fa-calendar"></i> ${comment.date}</span>
                        <span><i class="far fa-user"></i> Estudiante</span>
                    </div>
                    <p class="comment-text">${comment.text}</p>
                </li>
            `;
        });

        commentsHTML += '</ul>';
        commentsContainer.innerHTML = commentsHTML;
    } else {
        commentsContainer.innerHTML = `
            <div class="no-comments">
                <i class="far fa-comment-slash" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <h3>No hay comentarios aún</h3>
                <p>Este profesor no tiene comentarios de estudiantes</p>
            </div>
        `;
    }

    commentsModal.style.display = 'flex';
}

// Función para quitar acentos/diacríticos
function removeDiacritics(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Función para filtrar los datos
function filterData() {
    const semester = semesterSelect.value;
    const group = groupSelect.value;
    const searchTerm = removeDiacritics(searchInput.value.toLowerCase());

    const combinedData = combineScheduleAndEvaluations();

    let filteredData = combinedData;

    // Filtrar por semestre
    if (semester) {
        filteredData = filteredData.filter(item => item.semester === semester);
    }

    // Filtrar por grupo
    if (group) {
        filteredData = filteredData.filter(item => item.group === group);
    }

    // Filtrar por término de búsqueda
    if (searchTerm) {
        filteredData = filteredData.filter(item =>
            removeDiacritics(item.professor.toLowerCase()).includes(searchTerm) ||
            removeDiacritics(item.subject.toLowerCase()).includes(searchTerm)
        );
    }

    renderTable(filteredData);
}

// Función para resaltar filas actualizadas
function highlightUpdatedProfessor(professor) {
    const updatedRows = document.querySelectorAll(`[data-professor="${professor}"]`);
    updatedRows.forEach(rowCell => {
        const row = rowCell.closest('tr');
        row.classList.add('update-animation');

        // Quitar la animación después de que termine
        setTimeout(() => {
            row.classList.remove('update-animation');
        }, 1500);
    });
}

// Event listeners
semesterSelect.addEventListener('change', () => {
    updateGroupOptions();
    filterData();
});

groupSelect.addEventListener('change', filterData);
searchInput.addEventListener('input', filterData);

// Cerrar modal
closeModal.addEventListener('click', () => {
    commentsModal.style.display = 'none';
});

// Cerrar modal al hacer clic fuera del contenido
window.addEventListener('click', (e) => {
    if (e.target === commentsModal) {
        commentsModal.style.display = 'none';
    }
});
                                //FUNCIONES FINALES de INICIALIZACIÓN FORMULARIO//
                                // Inicialización global, fuera de cualquier función
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM completamente cargado");
    showLoadingState();
    
    // Configurar listener para el botón de limpiar caché
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            if (confirm('¿Estás seguro de querer limpiar la caché? Se cargarán datos frescos.')) {
                clearCache().then(success => {
                    if (!success) {
                        alert('Ocurrió un error. Por favor recarga la página manualmente.');
                    }
                });
            }
        });
    }
    
    // Inicializar la aplicación
    initializeApp();
});