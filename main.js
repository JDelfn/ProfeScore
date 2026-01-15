//Unififcacion de las paginas ---

//CONFIGURACIÓN GLOBAL Y FIREBASE ---
const firebaseConfig = {
    apiKey: "AlzaSyC-xvM9xOfg8SqdWej2ebMPQ75lm0mXpbc",
    authDomain: "evaluacion-profesores-df107.firebaseapp.com",
    projectId: "evaluacion-profesores-df107", 
    storageBucket: "evaluacion-profesores-df107.appspot.com", 
    messagingSenderId: "182131194576", 
    appId: "1:182131194576:web:fc4b91499a2bc1435cfcd5" 
};

// Inicialización única
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(); 

// URLs de Datos CORREGIDAS
const API_URL_FORM = 'https://script.google.com/macros/s/AKfycbyOp2QxybDn4FSjn5aYO8DYQkI1i5LsiXIw2xy48yrjlVmMK97eeKq5TMk4L72stDNo/exec'; 
const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQa3aGxJT18QCegGY4ol0ZV2n3wBG2gQ_KM2kux_NxUJkvXMF7fIaDe5EVMIH3vUEjDUUoInMkZEW-T/pub?output=csv';
const CACHE_VALIDITY = 30 * 60 * 1000;

// VARIABLES DE ESTADO ---
// Variables para la Encuesta
let gruposPorSemestre = {}; 
let profesoresPorGrupo = {}; 
let selectedSemesters = []; 
let selectedGroups = []; 
let selectedTeachers = []; 
let encuestaEvaluations = {}; // Cambiado para evitar conflicto
let ALL_TEACHERS = [];
let gruposSeleccionadosBusqueda = new Set();
let selectedHigherGroups = {}; 
let desdeBusquedaDocente = false; 
let agregandoDesdeTeachersSection = false;

// Variables para los Resultados
let evaluationsFirestore = []; // Datos crudos de Firebase
let scheduleData = []; // Datos de horarios de Google Sheets
let groupsBySemesterResults = {}; 
// Variable global faltante
let lastGroup = null;

// --- 3. LÓGICA DE NAVEGACIÓN (TABS) ---
function setupNavigation() {
    const btnEncuesta = document.getElementById('tab-encuesta');
    const btnResultados = document.getElementById('tab-resultados');
    const vistaEncuesta = document.getElementById('vista-encuesta');
    const vistaResultados = document.getElementById('vista-resultados');

    btnEncuesta.addEventListener('click', () => {
        vistaEncuesta.classList.remove('hidden');
        vistaResultados.classList.add('hidden');
        btnEncuesta.classList.add('active');
        btnResultados.classList.remove('active');
    });

    btnResultados.addEventListener('click', () => {
        vistaResultados.classList.remove('hidden');
        vistaEncuesta.classList.add('hidden');
        btnResultados.classList.add('active');
        btnEncuesta.classList.remove('active');
        // Si no hay datos de horario, cargarlos al entrar
        if (scheduleData.length === 0) initResultadosApp();
    });
}

// --- 4. LÓGICA DEL FORMULARIO (ENCUESTA) ---

//Funciones de carga inicial
function showErrorState(error) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.innerHTML = `
            <div style="text-align: center; color: red; padding: 20px;">
                <h3>Error al cargar el formulario</h3>
                <p>${error.message}</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Reintentar
                </button>
            </div>`;
    }
}

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

async function fetchData() {
    const response = await fetch(API_URL_FORM);
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
async function cargarDatos() {
    try {
        console.log("Iniciando carga de datos de la encuesta");

        //Verificar cache
        const { cachedData, isFresh } = checkCache();
        
        if (cachedData && isFresh) {
            console.log("Usando datos de caché");
            await useCachedData(cachedData);
            if (cachedData.docentes) ALL_TEACHERS = cachedData.docentes;
        } else {
            console.log("Obteniendo datos frescos de la API");
            // 2. Traer datos de Google Apps Script 
            const data = await fetchData(); 
            updateCache(data);
            await useCachedData(data); 
            if (data.docentes) ALL_TEACHERS = data.docentes;
        }

        // 3. Mostrar la primera sección del formulario
        document.getElementById('semesters-section').classList.remove('hidden');
        document.getElementById('form-container').style.display = 'block';
        
        // 4. Activar los escuchas de botones
        configurarEventListeners(); 

    } catch (error) {
        console.error("[ERROR] En cargarDatos:", error);
        showErrorState(error);
    } finally {
        hideLoadingState();
    }
}

//Logica de generacion Formulario -- 

// Función para llenar grupos en columnas
// Función corregida: Ordenamiento Natural de Grupos
function llenarGruposEnColumnas() { 
    console.log("Llenando grupos...");
    
    const checks = document.querySelectorAll('input[name="semester"]:checked');
    selectedSemesters = Array.from(checks).map(cb => cb.value);
    
    if (selectedSemesters.length === 0) {
        alert('Por favor selecciona al menos un semestre.');
        return false;
    }
    
    const container = document.getElementById('groups-container');
    container.innerHTML = '';
    
    // Separar semestres
    const regularSemesters = selectedSemesters.filter(s => s <= 6);
    const higherSemesters = selectedSemesters.filter(s => s > 6);
    
    //Procesar semestres regulares (1-6)
    regularSemesters.forEach(semestre => {
        let grupos = gruposPorSemestre[semestre];
        
        if (!grupos || grupos.length === 0) return;

        //Ordenar de forma natural
        grupos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const column = document.createElement('div');
        column.className = 'group-column';
        column.innerHTML = `<h3>Semestre ${semestre}</h3>
                          <div class="group-checkboxes" id="groups-${semestre}"></div>`;
        
        container.appendChild(column);

        grupos.forEach(grupo => {
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
    
    // Procesar semestres superiores (7-10) - Buscador
    if (higherSemesters.length > 0) {
        const higherContainer = document.createElement('div');
        higherContainer.className = 'higher-semester-container';
        higherContainer.innerHTML = `
            <h3>Busca tus grupos y agrégalos: </h3>
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
            
            // Ordenar los resultados de búsqueda
            filteredGroups.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));
            
            renderGroupSearchResults(filteredGroups);
        });
        
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

// Búsqueda Integrada sin conflictos
function toggleInlineSearch(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const searchBox = document.getElementById('inline-search-box');
    const searchButton = document.getElementById('show-inline-search');
    const searchInput = document.getElementById('inline-search-input');
    
    if (!searchBox || !searchButton) return;
    
    // Lógica de Alternar (Toggle)
    if (searchBox.classList.contains('visible')) {
        // Ocultar
        searchBox.classList.remove('visible');
        searchButton.innerHTML = '<i class="fas fa-search"></i> Buscar más docentes';
        document.getElementById('inline-search-results').innerHTML = '';
        if (searchInput) searchInput.value = '';
    } else {
        // Mostrar
        searchBox.classList.add('visible');
        searchButton.innerHTML = '<i class="fas fa-times"></i> Cancelar búsqueda';
        // Foco automático
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

// Función corregida: Comentarios Obligatorios
function crearEvaluaciones() {
    const container = document.getElementById('evaluation-items');
    container.innerHTML = '';

    // 1. Determinar qué profesores evaluar
    let profesoresParaEvaluar;
    if (typeof profesoresSeleccionadosBusqueda !== 'undefined' && profesoresSeleccionadosBusqueda.size > 0) {
        profesoresParaEvaluar = Array.from(profesoresSeleccionadosBusqueda);
        selectedTeachers = profesoresParaEvaluar;
    } else {
        const checks = document.querySelectorAll('input[name="teacher"]:checked');
        profesoresParaEvaluar = Array.from(checks).map(cb => cb.value);
        selectedTeachers = profesoresParaEvaluar;
    }

    if (profesoresParaEvaluar.length === 0) {
        alert('Por favor selecciona al menos un docente.');
        return false;
    }

    // 2. Generar el formulario (CON CAMBIO VISUAL)
    profesoresParaEvaluar.forEach(profesor => {
        if (!encuestaEvaluations[profesor]) encuestaEvaluations[profesor] = { rating: null, comments: '' };
        
        const evaluationHTML = `
            <div class="evaluation-item">
                <h3>Evaluación para: ${profesor}</h3>
                
                <label class="required">Calificación:</label>
                <div class="rating-scale">
                    ${[1, 2, 3, 4, 5].map(num => `
                        <div class="rating-option">
                            <input type="radio" id="${profesor}-rating-${num}" name="${profesor}-rating" value="${num}">
                            <label for="${profesor}-rating-${num}">${num}</label>
                        </div>
                    `).join('')}
                </div>
                
                <label for="${profesor}-comments" class="required" style="margin-top:10px;">Comentarios (Obligatorio):</label>
                <textarea id="${profesor}-comments" rows="3" placeholder="Escribe tu opinión sobre el docente (mínimo 5 letras)..."></textarea>
            </div>`;
        container.insertAdjacentHTML('beforeend', evaluationHTML);
    });

    // 3. Botones de navegación
    const evalSection = document.getElementById('evaluation-section');
    const oldNav = evalSection.querySelector('.navigation-buttons');
    if (oldNav) oldNav.remove();

    const navBtns = document.createElement('div');
    navBtns.className = 'navigation-buttons';
    navBtns.style.display = 'flex';
    navBtns.style.justifyContent = 'space-between';
    navBtns.style.marginTop = '20px';

    // Botón ANTERIOR
    const backBtn = document.createElement('button');
    backBtn.textContent = 'Anterior';
    backBtn.onclick = () => {
        document.getElementById('evaluation-section').classList.add('hidden');
        document.getElementById('teachers-section').classList.remove('hidden');
    };

    // Botón ENVIAR (CON CAMBIO LÓGICO)
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Enviar Evaluación';
    submitBtn.style.backgroundColor = '#2ecc71'; 
    
    submitBtn.onclick = async () => {
        let allComplete = true; // Cambiamos nombre de variable para reflejar que revisa todo
        let missing = [];
        
        selectedTeachers.forEach(teacher => {
            const ratingEl = document.querySelector(`input[name="${teacher}-rating"]:checked`);
            const commentEl = document.getElementById(`${teacher}-comments`);
            const commentText = commentEl.value.trim(); // .trim() quita los espacios vacíos al inicio y final

            // VALIDACIÓN: Checamos si falta calificación O si el comentario es muy corto
            if (!ratingEl || commentText.length < 5) {
                allComplete = false;
                missing.push(teacher);
                
                // Opcional: Poner borde rojo al comentario si falta
                if(commentText.length < 5) {
                    commentEl.style.border = "2px solid red";
                } else {
                    commentEl.style.border = "1px solid #ddd";
                }
            } else {
                // Si todo está bien, guardamos
                encuestaEvaluations[teacher].rating = ratingEl.value;
                encuestaEvaluations[teacher].comments = commentText;
                // Quitamos el borde rojo si ya lo corrigió
                commentEl.style.border = "1px solid #ddd";
            }
        });

        if (!allComplete) {
            alert(`Falta información para: ${missing.join(', ')}. \n\nAsegúrate de poner calificación y un comentario (mínimo 5 letras).`);
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

            await db.collection('evaluaciones').add({
                semestres: selectedSemesters,
                grupos: selectedGroups,
                docentes: selectedTeachers.map(t => ({
                    nombre: t,
                    calificacion: encuestaEvaluations[t].rating,
                    comentarios: encuestaEvaluations[t].comments
                })),
                fecha: firebase.firestore.FieldValue.serverTimestamp()
            });

            document.getElementById('evaluation-section').classList.add('hidden');
            document.getElementById('confirmation-section').classList.remove('hidden');
            
        } catch (error) {
            console.error(error);
            alert("Error al enviar: " + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar Evaluación';
        }
    };

    navBtns.appendChild(backBtn);
    navBtns.appendChild(submitBtn);
    evalSection.appendChild(navBtns);

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
}
// Envío a Firestore 

// --- 5. LÓGICA DE RESULTADOS (TIEMPO REAL) ---

// 1. Definición de Elementos del DOM (¡Deben ir antes de usarse!)
const semesterSelect = document.getElementById('semester');
const groupSelect = document.getElementById('group');
const searchInputResultados = document.getElementById('search'); 
const tableBody = document.querySelector('#vista-resultados #table-body'); // Selector específico
const commentsModal = document.getElementById('comments-modal');
const commentsContainer = document.getElementById('comments-container');
const professorNameElement = document.querySelector('.modal-title');
const lastUpdatedElement = document.getElementById('last-updated');
// Nota: 'lastGroup' ya está definida arriba, no la re-declares aquí.

// 2. Funciones de Lógica
function setupFirebaseListeners() {
    // Usamos 'evaluationsFirestore' que es la variable global que definiste arriba
    db.collection('evaluaciones').onSnapshot((snapshot) => { 
        evaluationsFirestore = []; 
        snapshot.forEach((doc) => {
            const data = doc.data(); 
            if (Array.isArray(data.docentes)) {
                data.docentes.forEach((docente) => {
                    evaluationsFirestore.push({
                        professor: docente.nombre, 
                        rating: parseFloat(docente.calificacion) || 0, 
                        comment: docente.comentarios || "", 
                        timestamp: data.fecha ? new Date(data.fecha.seconds * 1000) : Date.now() 
                    });
                });
            }
        });
        // Solo filtramos si ya tenemos horarios cargados
        if(scheduleData.length > 0) {
            filterData(); 
        }
        updateLastUpdated(); 
    });
}

async function initResultadosApp() {
    try {
        const response = await fetch(GOOGLE_SHEETS_URL); 
        const csvData = await response.text(); 
        scheduleData = csvToJson(csvData); 
        
        // Generar las opciones de grupos y semestres basadas en el CSV
        generateGroupsBySemester();
        updateGroupOptions();

        setupFirebaseListeners(); 
    } catch (error) {
        console.error("Error cargando horarios:", error); 
    }
}

// LA FUNCIÓN QUE FALTABA: Combinar Horarios + Evaluaciones
function combineScheduleAndEvaluations() {
    const combinedData = [];
    scheduleData.forEach(scheduleItem => {
        // Normalizamos nombres de columnas (por si vienen en inglés o español en el CSV)
        const professorName = scheduleItem.Profesor || scheduleItem.professor;
        const stats = calculateProfessorStats(professorName);

        combinedData.push({
            semester: scheduleItem.Semestre || scheduleItem.semester,
            group: scheduleItem.Grupo || scheduleItem.group,
            subject: scheduleItem.Asignatura || scheduleItem.subject,
            professor: professorName,
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

function calculateProfessorStats(professorName) {
    const professorEvaluations = evaluationsFirestore.filter(e => e.professor === professorName);
    
    if (professorEvaluations.length === 0) {
        return { rating: 0, comments: [] };
    }
    
    const totalRating = professorEvaluations.reduce((sum, evaluation) => sum + evaluation.rating, 0);
    const averageRating = totalRating / professorEvaluations.length;
    
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

function filterData() {
    // Validación de seguridad por si los elementos aún no existen
    if(!semesterSelect || !groupSelect || !searchInputResultados) return;

    const semester = semesterSelect.value;
    const group = groupSelect.value;
    const searchTerm = removeDiacritics(searchInputResultados.value.toLowerCase());

    const combinedData = combineScheduleAndEvaluations();
    let filteredData = combinedData;

    if (semester) {
        filteredData = filteredData.filter(item => item.semester === semester);
    }
    if (group) {
        filteredData = filteredData.filter(item => item.group === group);
    }
    if (searchTerm) {
        filteredData = filteredData.filter(item =>
            removeDiacritics(item.professor.toLowerCase()).includes(searchTerm) ||
            removeDiacritics(item.subject.toLowerCase()).includes(searchTerm)
        );
    }

    renderTable(filteredData);
}

// Helpers necesarios para resultados
function generateGroupsBySemester() {
    groupsBySemesterResults = {}; // Usamos la variable global correcta
    scheduleData.forEach(item => {
        const semester = item.Semestre || item.semester;
        const group = item.Grupo || item.group;
        if (!groupsBySemesterResults[semester]) {
            groupsBySemesterResults[semester] = new Set();
        }
        groupsBySemesterResults[semester].add(group);
    });
}

function updateGroupOptions() {
    const semester = semesterSelect.value;
    groupSelect.innerHTML = '<option value="">Todos los grupos</option>';
    
    if (semester && groupsBySemesterResults[semester]) {
        const groups = Array.from(groupsBySemesterResults[semester])
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group;
            option.textContent = `Grupo ${group}`;
            groupSelect.appendChild(option);
        });
    }
}

// Listeners de los filtros (Resultados)
if(semesterSelect) {
    semesterSelect.addEventListener('change', () => {
        updateGroupOptions();
        filterData();
    });
}
if(groupSelect) groupSelect.addEventListener('change', filterData);
if(searchInputResultados) searchInputResultados.addEventListener('input', filterData);

// Cierre de modales
if(document.querySelector('.close-modal')) {
    document.querySelector('.close-modal').addEventListener('click', () => {
        commentsModal.style.display = 'none';
    });
}
window.addEventListener('click', (e) => {
    if (e.target === commentsModal) {
        commentsModal.style.display = 'none';
    }
});

// --- FUNCIONES FALTANTES PARA RESULTADOS ---

// 1. Formatear Fechas (Vital para los comentarios)
function formatDate(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Hace unos segundos';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} minutos`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
    return `Hace ${Math.floor(diff / 86400)} días`;
}

// 2. Actualizar texto de "Última actualización"
function updateLastUpdated() {
    if(lastUpdatedElement) {
        const now = new Date();
        lastUpdatedElement.textContent = "Actualizado: " + now.toLocaleTimeString();
    }
}

// 3. Obtener clase de color según calificación (Verde, Amarillo, Rojo)
function getRatingClass(rating) {
    if (rating >= 4.0) return 'rating-high';
    if (rating >= 2.5) return 'rating-medium';
    return 'rating-low';
}

// 4. Quitar acentos para la búsqueda (Para que "Martínez" salga al buscar "Martinez")
function removeDiacritics(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// 5. Mostrar Modal de Comentarios
function showComments(professor) {
    const stats = calculateProfessorStats(professor);
    
    if(professorNameElement) professorNameElement.textContent = `Comentarios sobre ${professor}`;
    
    if (stats.comments.length > 0) {
        let commentsHTML = '<ul class="comments-list">';
        stats.comments.forEach(comment => {
            commentsHTML += `
                <li class="comment-item">
                    <div class="comment-header">
                        <span><i class="fas fa-calendar"></i> ${comment.date}</span>
                        <span><i class="fas fa-user"></i> Estudiante</span>
                    </div>
                    <p class="comment-text">${comment.text}</p>
                </li>`;
        });
        commentsHTML += '</ul>';
        commentsContainer.innerHTML = commentsHTML;
    } else {
        commentsContainer.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-comment-slash" style="font-size: 3rem; margin-bottom: 15px; color: #ccc;"></i>
                <h3>No hay comentarios aún</h3>
                <p>Este profesor no tiene comentarios de estudiantes.</p>
            </div>`;
    }
    commentsModal.style.display = 'flex';
}

// --- FUNCIÓN FALTANTE: RENDERIZAR TABLA ---
function renderTable(data) {
    const tableBody = document.querySelector('#vista-resultados #table-body');
    tableBody.innerHTML = '';
    
    // Reiniciamos lastGroup para los divisores visuales
    lastGroup = null; 

    if (data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 30px;">
                    <h3>No se encontraron resultados</h3>
                    <p>Intenta con otros filtros.</p>
                </td>
            </tr>`;
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

        // Colorear fila suavemente según calificación
        if (item.rating >= 4.0) row.style.backgroundColor = 'rgba(46, 204, 113, 0.1)';
        else if (item.rating >= 2.5) row.style.backgroundColor = 'rgba(243, 156, 18, 0.1)';
        else if (item.rating >= 1.0) row.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';

        row.innerHTML = `
            <td>${item.group}</td>
            <td>${item.subject}</td>
            <td class="professor-cell" onclick="showComments('${item.professor}')" style="cursor:pointer; color:#3498db; font-weight:bold;">
                <i class="fas fa-user-graduate"></i> ${item.professor}
            </td>
            <td><span class="rating ${ratingClass}">${item.rating.toFixed(1)}</span></td>
            <td>${item.schedule.monday || '-'}</td>
            <td>${item.schedule.tuesday || '-'}</td>
            <td>${item.schedule.wednesday || '-'}</td>
            <td>${item.schedule.thursday || '-'}</td>
            <td>${item.schedule.friday || '-'}</td>
        `;
        tableBody.appendChild(row);
    });
}



// --- 6. FUNCIONES AUXILIARES ---

function csvToJson(csv) {
    const lines = csv.split('\n'); 
    const headers = lines[0].split(',').map(h => h.trim()); 
    return lines.slice(1).filter(line => line).map(line => {
        const currentLine = line.split(','); 
        const obj = {};
        headers.forEach((h, i) => obj[h] = currentLine[i] ? currentLine[i].trim() : ""); 
        return obj;
    });
}

function showLoadingState() {
    document.getElementById('loading-screen').style.display = 'flex'; 
    document.getElementById('form-container').style.display = 'none'; 
}

function hideLoadingState() {
    document.getElementById('loading-screen').style.display = 'none'; 
    document.getElementById('form-container').style.display = 'block'; 
}

// --- 7. INICIALIZACIÓN AL CARGAR EL DOM ---

document.addEventListener('DOMContentLoaded', () => { 
    setupNavigation();
    cargarDatos(); // Esta es la que usa el caché
});