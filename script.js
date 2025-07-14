// Configuración
const CACHE_VALIDITY = 30 * 60 * 1000; // 30 minutos de caché
const API_URL = 'https://script.google.com/macros/s/AKfycbw2ekK0uajNwCG7gkg2j_UhBzYkqNvqm2JSmh4-YWgjZDxLwtlLB6w3ByilxHS1ajE/exec';

// Variables globales
let gruposPorSemestre = {};
let profesoresPorGrupo = {};
let selectedSemesters = [];
let selectedGroups = [];
let selectedTeachers = [];
let evaluations = {};

// Control del skeleton loader
let skeletonTimeout;

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
        
        // Verificar caché
        const { cachedData, isFresh } = checkCache();
        console.log("[2] Estado de caché:", { cachedData: !!cachedData, isFresh });
        
        if (cachedData && isFresh) {
            console.log("[3] Usando datos de caché");
            await useCachedData(cachedData);
        } else {
            console.log("[3] Obteniendo datos frescos");
            const data = await fetchData();
            console.log("[4] Datos recibidos:", data);
            updateCache(data);
            await useCachedData(data);
        }
        
        console.log("[5] Configurando listeners");
        configurarEventListeners();
        
        console.log("[6] Mostrando formulario");
        document.getElementById('semesters-section').classList.remove('hidden');
        document.getElementById('form-container').style.display = 'block';
        
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
    
    selectedSemesters.forEach(semestre => {
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
    
    return true;
}

// Función para llenar profesores con checkboxes
function llenarProfesoresCheckboxes() {
  const container = document.getElementById('teachers-container');
  container.innerHTML = '';
  
  // Obtener grupos seleccionados
  const checks = document.querySelectorAll('input[name="group"]:checked');
  selectedGroups = Array.from(checks).map(cb => cb.value);
  
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
  
  return true;
}

// Función para crear evaluaciones
function crearEvaluaciones() {
  const container = document.getElementById('evaluation-items');
  container.innerHTML = '';
  
  // Obtener profesores seleccionados
  const checks = document.querySelectorAll('input[name="teacher"]:checked');
  selectedTeachers = Array.from(checks).map(cb => cb.value);
  
  if (selectedTeachers.length === 0) {
    alert('Por favor selecciona al menos un docente.');
    return false;
  }
  
  // Crear sección de evaluación para cada profesor
selectedTeachers.forEach(profesor => {
    evaluations[profesor] = { rating: null, comments: '' };
    
    const evaluationHTML = `
      <div class="evaluation-item">
        <h3>Evaluación para: ${profesor}</h3>

        <label class="required">Calificación: Asigna una calificación según la escala:<br>
          <span class="rating-scale-description">
            -2=Nada recomendado &nbsp;&nbsp; -1=Hay mejores &nbsp;&nbsp; 0=Neutral &nbsp;&nbsp; 1=Bueno &nbsp;&nbsp; 2=Totalmente recomendado
          </span>
        </label>
        <div class="rating-scale">
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating--2" name="${profesor}-rating" value="-2">
            <label for="${profesor}-rating--2">-2</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating--1" name="${profesor}-rating" value="-1">
            <label for="${profesor}-rating--1">-1</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-0" name="${profesor}-rating" value="0">
            <label for="${profesor}-rating-0">0</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-1" name="${profesor}-rating" value="1">
            <label for="${profesor}-rating-1">1</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-2" name="${profesor}-rating" value="2">
            <label for="${profesor}-rating-2">2</label>
          </div>
        </div>
        
        <label for="${profesor}-comments">Comentarios adicionales:</label>
        <textarea id="${profesor}-comments" rows="4" placeholder="Escribe aqui tu opinion o recomendación del docente..."></textarea>
      </div>`;
    
    container.insertAdjacentHTML('beforeend', evaluationHTML);
  });
  
  return true;
}

// Configuración de event listeners
function configurarEventListeners(){
  // Navegación entre secciones
  document.getElementById('next-to-groups').addEventListener('click', () => {
    if (llenarGruposEnColumnas()) {
      document.getElementById('semesters-section').classList.add('hidden');
      document.getElementById('groups-section').classList.remove('hidden');
    }
  });
  
  document.getElementById('back-to-semesters').addEventListener('click', () => {
    document.getElementById('groups-section').classList.add('hidden');
    document.getElementById('semesters-section').classList.remove('hidden');
  });
  
  document.getElementById('next-to-teachers').addEventListener('click', () => {
    if (llenarProfesoresCheckboxes()) {
      document.getElementById('groups-section').classList.add('hidden');
      document.getElementById('teachers-section').classList.remove('hidden');
    }
  });
  
  document.getElementById('back-to-groups').addEventListener('click', () => {
    document.getElementById('teachers-section').classList.add('hidden');
    document.getElementById('groups-section').classList.remove('hidden');
  });
  
  document.getElementById('next-to-evaluation').addEventListener('click', () => {
    if (crearEvaluaciones()) {
      document.getElementById('teachers-section').classList.add('hidden');
      document.getElementById('evaluation-section').classList.remove('hidden');
    }
  });
  
  document.getElementById('back-to-teachers').addEventListener('click', () => {
    document.getElementById('evaluation-section').classList.add('hidden');
    document.getElementById('teachers-section').classList.remove('hidden');
  });
  
  document.getElementById('clear-cache-btn').addEventListener('click', () => {
    if (confirm('¿Estás seguro de querer limpiar la caché? Se cargarán datos frescos.')) {
      clearCache().then(success => {
        if (!success) {
          alert('Ocurrió un error. Por favor recarga la página manualmente.');
        }
      });
    }
  });
  
  document.getElementById('next-to-contact').addEventListener('click', () => {
    // Validar que todas las evaluaciones estén completas
    let allRated = true;
    let unratedTeachers = [];
  
  document.getElementById('back-to-evaluation').addEventListener('click', () => {
    document.getElementById('contact-section').classList.add('hidden');
    document.getElementById('evaluation-section').classList.remove('hidden');
  });

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
    
    document.getElementById('evaluation-section').classList.add('hidden');
    document.getElementById('contact-section').classList.remove('hidden');
  });
  
  document.getElementById('submit-form').addEventListener('click', async () => {
    // Validar que al menos un profesor fue calificado
    let allRated = true;
    let unratedTeachers = [];
    
    selectedTeachers.forEach(teacher => {
        const rating = document.querySelector(`input[name="${teacher}-rating"]:checked`);
        if (!rating) {
            allRated = false;
            unratedTeachers.push(teacher);
        } else {
            evaluations[teacher].rating = rating.value;
            evaluations[teacher].comments = document.getElementById(`${teacher}-comments`).value;
        }
    });
    
    if (!allRated) {
        alert(`Por favor califica a todos los docentes. Faltan: ${unratedTeachers.join(', ')}`);
        return;
    }

    // Preparar datos para Firestore
    const data = {
        semestres: selectedSemesters,
        grupos: selectedGroups,
        profesores: selectedTeachers,
        evaluaciones: evaluations,
        email: document.getElementById('email').value || 'anonimo',
        fecha: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Mostrar estado de carga
    const submitBtn = document.getElementById('submit-form');
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Enviando... <span class="spinner-mini"></span>';

    try {
        // Guardar en Firestore
        await db.collection("evaluaciones").add(data);
        
        // Mostrar confirmación
        document.getElementById('contact-section').classList.add('hidden');
        
        if (data.email) {
            document.getElementById('email-confirmation').innerHTML = `
                <p>Se enviará una copia a: ${data.email}</p>
            `;
        }
        
        document.getElementById('thank-you-message').classList.remove('hidden');
        
    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Ocurrió un error al enviar tu evaluación. Por favor intenta nuevamente.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Evaluación';
    }
});

} // <-- Cierre correcto de la función

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

  // Espera a que Firebase esté completamente cargado
  const firebaseCheck = setInterval(() => {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      clearInterval(firebaseCheck);
      cargarDatos().catch(error => {
        console.error("Error en inicialización:", error);
        showErrorState(error);
        hideLoadingState(); // Oculta el loader si hay error
      });
    } else if (typeof firebase === 'undefined' || !window.firebase) {
      // Si después de cierto tiempo Firebase no está, muestra error y oculta loader
      clearInterval(firebaseCheck);
      showErrorState(new Error("Firebase no está disponible"));
      hideLoadingState();
    }
  }, 100);
});

