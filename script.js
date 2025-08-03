// Configuración
const CACHE_VALIDITY = 30 * 60 * 1000; // 30 minutos de caché
const API_URL = 'https://script.google.com/macros/s/AKfycbyOp2QxybDn4FSjn5aYO8DYQkI1i5LsiXIw2xy48yrjlVmMK97eeKq5TMk4L72stDNo/exec';

// Variables globales
let gruposPorSemestre = {};
let profesoresPorGrupo = {};
let selectedSemesters = [];
let selectedGroups = [];
let selectedTeachers = [];
let evaluations = {};
let ALL_TEACHERS = []; // Lista global de todos los docentes
let profesoresSelecionadosBusqueda = new Set(); // Set para manejar selección de docentes desde búsqueda
let agregandoDesdeTeachersSection = false; // Indica si se está agregando desde la sección de docentes
let desdeBusquedaDocente = false; // Indica si se viene de la búsqueda de docentes
let db; // Variable para la referencia a Firestore
let skeletonTimeout; //Control del skeleton loader
let selectedHigherGroups = {};
let gruposSeleccionadosBusqueda = new Set();

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
        
        // Verificar si Firebase está listo
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            throw new Error("Firebase no está disponible");
        }
        
        // INICIALIZAR FIRESTORE AQUÍ
        if (!db) {
            try {
                db = firebase.firestore();
                console.log("Firestore inicializado correctamente");
            } catch (firestoreError) {
                console.error("Error inicializando Firestore:", firestoreError);
                throw new Error("Error en Firestore: " + firestoreError.message);
            }
        }

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
        
        console.log("[6] Mostrando formulario");
        document.getElementById('semesters-section').classList.remove('hidden');
        document.getElementById('form-container').style.display = 'block';

        console.log("[5] Configurando listeners");
        configurarEventListeners();
        
    } catch (error) {
        console.error("[ERROR] En cargarDatos:", error);
        showErrorState(error);
    } finally {
        console.log("[7] Ocultando loader");
        hideLoadingState();
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
    evaluations[profesor] = { rating: null, comments: '' };
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
        evaluations[teacher].rating = rating.value;
        evaluations[teacher].comments = document.getElementById(`${teacher}-comments`).value;
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
            calificacion: evaluations[teacher].rating,
            comentarios: evaluations[teacher].comments
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

  // Eliminar el listener del botón 'next-to-contact' y reemplazarlo por el de 'submit-form' en la sección de evaluación
  /*
  safeAddListener('next-to-contact', 'click', () => {
    let allRated = true;
    let unratedTeachers = [];

    selectedTeachers.forEach(teacher => {
      const rating = document.querySelector(`input[name="${teacher}-rating"]:checked`);
      if (!rating) {
        allRated = false;
        unratedTeachers.push(teacher);
        return;
      }
      
      evaluations[teacher].rating = rating.value;
      evaluations[teacher].comments = document.getElementById(`${teacher}-comments`).value;
    });
    
    if (!allRated) {
      alert(`Por favor califica a todos los docentes. Faltan: ${unratedTeachers.join(', ')}`);
      return;
    }
    
    hideSection('evaluation-section');
    showSection('contact-section');
  });
  */

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
      evaluations[teacher].rating = rating.value;
      evaluations[teacher].comments = document.getElementById(`${teacher}-comments`).value;
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
          calificacion: evaluations[teacher].rating,
          comentarios: evaluations[teacher].comments
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

// Inicialización global, fuera de cualquier función
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM completamente cargado");
  showLoadingState();

  // Listener para limpiar caché, por si la carga falla antes de configurar los listeners normales
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

    // SOLUCIÓN MEJORADA PARA INICIALIZACIÓN DE FIREBASE
    const firebaseCheck = setInterval(() => {
        try {
            // 1. Verificar si Firebase está disponible
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                console.log("Firebase está disponible");
                clearInterval(firebaseCheck);
                
                // Inicializar Firestore
                try {
                    db = firebase.firestore();
                    console.log("Firestore inicializado correctamente");
                    
                    // Iniciar carga de datos
                    cargarDatos().catch(error => {
                        console.error("Error en carga de datos:", error);
                        showErrorState(error);
                        hideLoadingState();
                    });
                } catch (firestoreError) {
                    console.error("Error inicializando Firestore:", firestoreError);
                    showErrorState(new Error("Error en Firestore: " + firestoreError.message));
                    hideLoadingState();
                }
            }
            // 2. Manejar error si Firebase no carga
            else if (window.firebaseLoadTimeout && Date.now() - window.firebaseLoadTimeout > 10000) {
                clearInterval(firebaseCheck);
                console.error("Firebase no se cargó después de 10 segundos");
                showErrorState(new Error("Firebase no está disponible. Recarga la página."));
                hideLoadingState();
            }
        } catch (e) {
            console.error("Error en verificación Firebase:", e);
            clearInterval(firebaseCheck);
            showErrorState(e);
            hideLoadingState();
        }
    }, 100);

    // Iniciar timeout para Firebase
    if (!window.firebaseLoadTimeout) {
        window.firebaseLoadTimeout = Date.now();
    }
    
    // Al final del DOMContentLoaded, modificar la sección de agradecimientos si existe
  const confirmationSection = document.getElementById('confirmation-section');
  if (confirmationSection && !document.getElementById('ver-resultados-btn')) {
    const btn = document.createElement('a');
    btn.id = 'ver-resultados-btn';
    btn.href = 'https://jdelfn.github.io/Horarios-con-evaluaciones/';
    btn.target = '_blank';
    btn.className = 'btn-primary';
    btn.style.display = 'inline-block';
    btn.style.marginTop = '20px';
    btn.style.padding = '12px 28px';
    btn.style.borderRadius = '6px';
    btn.style.fontSize = '1rem';
    btn.style.fontWeight = 'bold';
    btn.style.textDecoration = 'none';
    btn.style.color = '#fff';
    btn.style.background = '#3498db';
    btn.style.boxShadow = '0 2px 8px rgba(52,152,219,0.08)';
    btn.style.transition = 'background 0.2s';
    btn.onmouseover = () => btn.style.background = '#217dbb';
    btn.onmouseout = () => btn.style.background = '#3498db';
    btn.innerHTML = '<i class="fas fa-external-link-alt"></i> Ver resultados de evaluaciones';
    confirmationSection.appendChild(btn);
  }
});