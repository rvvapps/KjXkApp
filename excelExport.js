// Contenido de ayuda por página
// pageId se mapea desde el pathname en App.jsx

export const HELP_CONTENT = {
  "/": {
    title: "¿Cómo funciona la app?",
    sections: [
      {
        heading: "De qué se trata",
        text: "Caja Chica te permite registrar tus gastos y agruparlos en rendiciones para solicitar reembolso. Todo queda guardado en tu dispositivo y se sincroniza automáticamente con OneDrive.",
      },
      {
        heading: "Dos formas de originar un gasto",
        text: "1. Directo: vas a Gastos y registras cualquier gasto (almuerzo, estacionamiento, materiales, etc.).\n\n2. Desde trayecto: primero registras cada recorrido en Trayectos (origen → destino, tipo de vehículo). Cuando cargas combustible, seleccionas los trayectos pendientes y los liquidas como un gasto de combustible.",
      },
      {
        heading: "El ciclo completo",
        text: "Registrar gastos → Agruparlos en una Rendición → Exportar Excel → Enviar a tu área de administración → La rendición pasa de Borrador a Enviada, luego puede ser Aprobada o Devuelta para corrección.",
      },
      {
        heading: "Indicadores del inicio",
        text: "• Gastado: total de gastos pendientes de rendir.\n• Cobrado: total de rendiciones aprobadas o pagadas.\n• Por cobrar: rendiciones aprobadas aún no pagadas.\n• Listos / Incompletos: gastos completos o con datos faltantes.\n• Trayectos sin gasto: recorridos registrados que aún no se han liquidado.",
      },
    ],
  },

  "/gastos": {
    title: "Gastos",
    sections: [
      {
        heading: "¿Qué es un gasto?",
        text: "Cualquier desembolso que necesitas rendir: combustible, estacionamiento, alimentación, materiales, peajes, etc. Cada gasto debe tener su documento de respaldo (boleta o foto).",
      },
      {
        heading: "Cómo ingresar un gasto",
        text: "Toca el botón + Nuevo gasto. Completa:\n• Concepto: tipo de gasto (combustible, estacionamiento, etc.)\n• Fecha y monto\n• Tipo de documento: Boleta, Factura, Voucher o Sin Doc\n• Número de documento\n• Centro de Responsabilidad (CR) y Cuenta Contable (obligatorios)\n• Partida y Clasificación (opcionales — depende del CR y cuenta)\n• Adjunta la foto del documento",
      },
      {
        heading: "Gastos incompletos",
        text: "Un gasto marcado como incompleto le falta algún dato obligatorio (monto cero, sin CR, sin cuenta, sin partida o sin foto cuando el concepto lo exige). Toca el ícono de edición para completarlo antes de poder rendirlo.",
      },
      {
        heading: "Estados de un gasto",
        text: "• Pendiente: listo para ser incluido en una rendición.\n• Rendido: ya fue incluido en una rendición.\n• Un gasto rendido solo se puede eliminar si la rendición está en estado Devuelta.",
      },
      {
        heading: "Adjuntar foto",
        text: "Toca el ícono de clip en el gasto. Puedes tomar una foto o elegir desde la galería. La imagen se comprime automáticamente para no ocupar espacio.",
      },
    ],
  },

  "/gastos/nuevo": {
    title: "Nuevo gasto",
    sections: [
      {
        heading: "Campos obligatorios",
        text: "• Concepto\n• Fecha\n• Monto (mayor a 0)\n• Tipo de documento\n• Centro de Responsabilidad\n• Cuenta Contable\n\nSi el concepto requiere N° de documento o foto, también serán obligatorios para poder rendir.",
      },
      {
        heading: "El concepto pre-completa campos",
        text: "Al seleccionar un concepto, la cuenta contable, partida y clasificación se llenan automáticamente con los valores por defecto configurados. Puedes cambiarlos si necesitas.",
      },
      {
        heading: "Detalle / Glosa",
        text: "Campo libre para agregar una descripción. Por ejemplo: 'Combustible - Ruta Coquimbo, auto arrendado'. Aparece en el Excel exportado.",
      },
    ],
  },

  "/gastos/editar": {
    title: "Editar gasto",
    sections: [
      {
        heading: "¿Cuándo puedo editar?",
        text: "Puedes editar un gasto mientras esté en estado Pendiente. Si ya fue incluido en una rendición Enviada o Aprobada, los campos quedan bloqueados.",
      },
      {
        heading: "Adjuntos",
        text: "Puedes agregar o eliminar fotos en cualquier momento mientras el gasto sea editable.",
      },
    ],
  },

  "/traslados": {
    title: "Trayectos",
    sections: [
      {
        heading: "¿Para qué sirven los trayectos?",
        text: "Registra cada viaje que realizas con vehículo propio, arrendado o transporte. Al cargar combustible, seleccionas todos los trayectos del período y los liquidas como un único gasto de combustible.",
      },
      {
        heading: "Cómo registrar un trayecto",
        text: "Toca el botón + Nuevo trayecto. Completa:\n• Fecha\n• Tipo: Vehículo propio, Auto arrendado, Taxi/Uber, Avión, Bus, Otro\n• Origen y destino\n• CR asociado\n• Monto estimado de combustible (opcional)\n• Visita o proyecto",
      },
      {
        heading: "Destinos favoritos",
        text: "Guarda los destinos que usas frecuentemente en Ajustes → App → Destinos. Al registrar un trayecto, puedes seleccionar un favorito para pre-completar el destino y el monto.",
      },
      {
        heading: "Liquidar combustible",
        text: "Selecciona los trayectos pendientes con las casillas de verificación y toca Liquidar. Ingresa el monto final que pagaste en la bomba (puede diferir de la suma estimada). Esto crea automáticamente un gasto de combustible con el detalle de todos los recorridos.",
      },
      {
        heading: "Estado de los trayectos",
        text: "• Pendiente: aún no se ha generado un gasto desde este trayecto.\n• Usado: ya fue incluido en un gasto de combustible.",
      },
    ],
  },

  "/rendiciones": {
    title: "Rendiciones",
    sections: [
      {
        heading: "¿Qué es una rendición?",
        text: "Un conjunto de gastos que agrupas para solicitar reembolso. La app genera un archivo Excel con formato corporativo que puedes enviar a administración.",
      },
      {
        heading: "Cómo crear una rendición",
        text: "En la lista de Gastos, selecciona los gastos pendientes que quieres incluir (usando las casillas) y toca Crear rendición. Se crea automáticamente con un número correlativo.",
      },
      {
        heading: "Estados de una rendición",
        text: "• Borrador: puedes editar y exportar.\n• Enviada: congelada, esperando respuesta.\n• Devuelta: fue rechazada para corrección. Puedes agregar o quitar gastos.\n• Aprobada: aceptada por administración.\n• Pagada: el reembolso fue acreditado.",
      },
      {
        heading: "Exportar Excel",
        text: "Desde el detalle de la rendición, toca el botón Excel. El archivo incluye el formulario de rendición (Hoja 1) y un resumen agrupado por CR, cuenta y partida (Hoja 2). El checkbox 'Caja Chica' se marca automáticamente.",
      },
    ],
  },

  "/rendiciones/detalle": {
    title: "Detalle de rendición",
    sections: [
      {
        heading: "Acciones disponibles",
        text: "Desde esta pantalla puedes:\n• Ver todos los gastos incluidos y su total\n• Exportar el Excel corporativo\n• Generar el PDF de respaldos (fotos de boletas)\n• Cambiar el estado (Enviar, Aprobar, Devolver, Pagar)",
      },
      {
        heading: "Exportar Excel",
        text: "El Excel sigue el formato corporativo. Incluye los datos del responsable (configurados en Ajustes → Perfil), la lista de gastos y el resumen por CR/cuenta/partida. El checkbox 'Caja Chica' aparece marcado.",
      },
      {
        heading: "Rendición devuelta",
        text: "Si la rendición fue devuelta, sus gastos quedan automáticamente disponibles en la lista de Gastos para corregir y volver a rendir. Puedes quitar gastos con error y agregar otros gastos pendientes. Una vez corregida, vuelve a exportar el Excel y cámbiala a Enviada.",
      },
    ],
  },

  "/ajustes": {
    title: "Ajustes",
    sections: [
      {
        heading: "Pestaña Perfil",
        text: "Ingresa tus datos personales (nombre, RUT, cargo, teléfono, empresa) y datos bancarios (tipo de cuenta, número, banco). Estos datos se usan para rellenar automáticamente el encabezado del Excel de rendición.",
      },
      {
        heading: "Pestaña App — Catálogos",
        text: "Administra los valores disponibles en los selectores de gastos:\n• Centros de Responsabilidad (CR)\n• Cuentas Contables\n• Partidas\n• Clasificaciones\n\nPuedes agregar, editar, desactivar o eliminar cada ítem. Los ítems desactivados no aparecen en los formularios pero conservan su historial.",
      },
      {
        heading: "Pestaña App — Conceptos",
        text: "Los conceptos son los tipos de gasto (Combustible, Estacionamiento, Alimentación, etc.). Cada concepto tiene valores por defecto para cuenta, partida y clasificación — estos dos últimos son opcionales. Puedes marcar favoritos para que aparezcan primero en el selector.\n\nConceptos sin usos: puedes eliminarlos definitivamente con el botón 🗑️.\nConceptos con gastos asociados: solo se pueden desactivar, no eliminar.",
      },
      {
        heading: "Pestaña App — Destinos",
        text: "Guarda los destinos frecuentes de trayectos con su monto estimado y CR. Al registrar un trayecto, podrás seleccionar un favorito para pre-completar los campos.",
      },
      {
        heading: "Pestaña App — General",
        text: "• Prefijo y número correlativo de rendiciones (ej: RC-001)\n• CR por defecto: se pre-selecciona al crear un gasto\n• Origen por defecto: punto de partida habitual para trayectos\n• Nombre del dispositivo: identifica este equipo en el historial de sync",
      },
      {
        heading: "Pestaña Datos — Backup",
        text: "Genera un archivo .cczip con todos tus datos protegido por contraseña. Puedes descargarlo o subirlo directamente a OneDrive. Recomendado hacer backup antes de restaurar.",
      },
      {
        heading: "Pestaña Datos — Restaurar",
        text: "Permite recuperar datos desde un archivo .cczip descargado antes, o bien desde el último backup guardado en OneDrive. La restauración reemplaza todos los datos actuales.",
      },
      {
        heading: "Pestaña Datos — Sync OneDrive",
        text: "Configura la sincronización automática entre dispositivos.\n• Tenant ID y Client ID: credenciales de tu Azure App Registration.\n• 🔗 Conectar: inicia sesión en OneDrive.\n• 🔄 Sincronizar ahora: fuerza una sincronización manual.\n• ⬇️ Recibir todo de nuevo: limpia el historial de eventos recibidos y vuelve a bajar todo desde OneDrive. Úsalo si este dispositivo no recibió datos de otro tras un restore.\n• ⬆️ Re-sincronizar todo: re-envía todos los datos locales hacia OneDrive. Úsalo si un dispositivo nuevo o recién restaurado no tiene tus datos.\n• 🔌 Desconectar: desvincula este dispositivo de OneDrive.\n• 🗑️ Limpiar eventos OneDrive: borra todos los eventos acumulados en OneDrive. Solo si hay datos corruptos o duplicados. Siempre seguir con Re-sincronizar todo.",
      },
    ],
  },
};

// Mapeo de pathnames a pageIds
export function getHelpPageId(pathname) {
  if (pathname === "/") return "/";
  if (pathname === "/gastos") return "/gastos";
  if (pathname === "/gastos/nuevo") return "/gastos/nuevo";
  if (pathname.startsWith("/gastos/")) return "/gastos/editar";
  if (pathname === "/traslados") return "/traslados";
  if (pathname === "/rendiciones") return "/rendiciones";
  if (pathname.startsWith("/rendiciones/")) return "/rendiciones/detalle";
  if (pathname === "/ajustes") return "/ajustes";
  return null;
}
