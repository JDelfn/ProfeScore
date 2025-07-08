// Variables globales
let gruposPorSemestre = {};
let profesoresPorGrupo = {};
let selectedSemesters = [];
let selectedGroups = [];
let selectedTeachers = [];
let evaluations = {};

// Función para cargar datos desde Google Sheets
async function cargarDatos() {
  try {
    const response = await fetch('https://script.google.com/macros/s/AKfycbw2ekK0uajNwCG7gkg2j_UhBzYkqNvqm2JSmh4-YWgjZDxLwtlLB6w3ByilxHS1ajE/exec');
    const data = await response.json();
    
    if (!data.success) throw new Error(data.error || 'Error al cargar datos');
    
    gruposPorSemestre = data.gruposPorSemestre;
    profesoresPorGrupo = data.profesoresPorGrupo;
    
    console.log('Datos cargados correctamente');
  } catch (error) {
    console.error('Error cargando datos:', error);
    alert('Error cargando datos: ' + error.message);
  }
}

// Función para llenar grupos en columnas
function llenarGruposEnColumnas() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';
  
  // Obtener semestres seleccionados
  const checks = document.querySelectorAll('input[name="semester"]:checked');
  selectedSemesters = Array.from(checks).map(cb => cb.value);
  
  if (selectedSemesters.length === 0) {
    alert('Por favor selecciona al menos un semestre.');
    return false;
  }
  
  // Crear columnas para cada semestre seleccionado
  selectedSemesters.forEach(semestre => {
    if (gruposPorSemestre[semestre]) {
      const column = document.createElement('div');
      column.className = 'group-column';
      column.innerHTML = `<h3>Grupos del ${semestre}° Semestre</h3>
                         <div class="group-checkboxes" id="groups-${semestre}"></div>`;
      container.appendChild(column);
      
      // Añadir checkboxes para cada grupo
      gruposPorSemestre[semestre].forEach(grupo => {
        const checkboxHTML = `
          <label class="checkbox-option">
            <input type="checkbox" name="group" value="${grupo}">
            <span class="checkmark"></span>
            ${grupo}
          </label>`;
        document.getElementById(`groups-${semestre}`).insertAdjacentHTML('beforeend', checkboxHTML);
      });
    }
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
        
        <label class="required">Calificación:</label>
        <div class="rating-scale">
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating--2" name="${profesor}-rating" value="-2">
            <label for="${profesor}-rating--2">-2 (Nada recomendado)</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating--1" name="${profesor}-rating" value="-1">
            <label for="${profesor}-rating--1">-1 (Hay peores)</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-0" name="${profesor}-rating" value="0">
            <label for="${profesor}-rating-0">0 (Neutral)</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-1" name="${profesor}-rating" value="1">
            <label for="${profesor}-rating-1">1 (Bueno)</label>
          </div>
          <div class="rating-option">
            <input type="radio" id="${profesor}-rating-2" name="${profesor}-rating" value="2">
            <label for="${profesor}-rating-2">2 (Totalmente recomendado)</label>
          </div>
        </div>
        
        <label for="${profesor}-comments">Comentarios adicionales:</label>
        <textarea id="${profesor}-comments" rows="4" placeholder="Escribe aquí tus comentarios..."></textarea>
      </div>`;
    
    container.insertAdjacentHTML('beforeend', evaluationHTML);
  });
  
  return true;
}

// Configuración de event listeners
function configurarEventListeners() {
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
  
  document.getElementById('next-to-contact').addEventListener('click', () => {
    // Validar que todas las evaluaciones estén completas
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
    
    document.getElementById('evaluation-section').classList.add('hidden');
    document.getElementById('contact-section').classList.remove('hidden');
  });
  
  document.getElementById('submit-form').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    
    // Aquí puedes enviar los datos al servidor
    console.log('Datos a enviar:', {
      semestres: selectedSemesters,
      grupos: selectedGroups,
      profesores: selectedTeachers,
      evaluaciones: evaluations,
      email: email
    });
    
    // Mostrar mensaje de confirmación
    document.getElementById('contact-section').classList.add('hidden');
    
    if (email) {
      document.getElementById('email-confirmation').innerHTML = `
        <p>Se enviará una copia a: ${email}</p>
      `;
    }
    
    document.getElementById('thank-you-message').classList.remove('hidden');
  });
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  cargarDatos().then(() => {
    configurarEventListeners();
  });
});