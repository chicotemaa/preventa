"""Build shareable pilot documents; credentials are written separately, locally."""
from pathlib import Path
import json
import os
import shutil

from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.utils import ImageReader


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf"
PUBLIC = ROOT / "apps/web/public/ayuda"
INK = colors.HexColor("#17202a")
MUTED = colors.HexColor("#526170")
RED = colors.HexColor("#c9333b")
BLUE = colors.HexColor("#153d7b")
LINE = colors.HexColor("#d9dee7")
LIGHT = colors.HexColor("#f3f5f7")
AMBER = colors.HexColor("#8a5b00")
GREEN = colors.HexColor("#176448")
DATE = "22/09/2026"


class Document:
    def __init__(self, name, title, landscape=False):
        self.path = OUT / name
        self.width, self.height = (842, 595) if landscape else (595, 842)
        self.margin = 42
        self.content_width = self.width - 84
        self.canvas = canvas.Canvas(str(self.path), pagesize=(self.width, self.height))
        self.canvas.setTitle(title)
        self.canvas.setAuthor("Aguiar - Proyecto de evaluacion de precios")
        self.page_count = 0
        self.y = 0

    def page(self, section, title, subtitle=""):
        if self.page_count:
            self.canvas.showPage()
        self.page_count += 1
        c = self.canvas
        c.setFillColor(RED)
        c.roundRect(42, self.height - 66, 26, 26, 4, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 19)
        c.drawCentredString(55, self.height - 59, "A")
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(78, self.height - 49, "Aguiar")
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(78, self.height - 62, "ASISTENTE DE EVALUACION DE PRECIOS")
        c.drawRightString(self.width - 42, self.height - 51, "PILOTO ASISTIDO  |  " + DATE)
        c.setStrokeColor(LINE)
        c.line(42, 38, self.width - 42, 38)
        c.setFont("Helvetica", 8)
        c.drawString(42, 24, "Aguiar  /  " + section + "  /  Sin credenciales")
        c.drawRightString(self.width - 42, 24, str(self.page_count))
        self.y = self.height - 96
        self.text(title, size=24, leading=28, bold=True, color=INK, after=9)
        if subtitle:
            self.text(subtitle, size=11, leading=16, color=MUTED, after=14)

    def text(self, value, size=10.5, leading=15, bold=False, color=INK, after=8):
        style = ParagraphStyle("body", fontName="Helvetica-Bold" if bold else "Helvetica",
                               fontSize=size, leading=leading, textColor=color, alignment=TA_LEFT)
        paragraph = Paragraph(value, style)
        _, h = paragraph.wrap(self.content_width, self.height)
        if self.y - h < 51:
            raise ValueError(f"Text overflow: page {self.page_count}, {value[:65]}")
        paragraph.drawOn(self.canvas, self.margin, self.y - h)
        self.y -= h + after

    def heading(self, value):
        self.y -= 5
        self.text(value, size=13, leading=17, bold=True, after=6)

    def note(self, value, color=AMBER):
        self.text(value, size=10, leading=14, color=color, after=12)

    def table(self, headers, rows, widths=None, size=9):
        style = ParagraphStyle("cell", fontName="Helvetica", fontSize=size, leading=size + 3,
                               textColor=INK)
        head = ParagraphStyle("head", parent=style, fontName="Helvetica-Bold", textColor=colors.white)
        data = [[Paragraph(str(v), head) for v in headers]]
        data += [[Paragraph(str(v), style) for v in row] for row in rows]
        t = Table(data, colWidths=widths or [self.content_width / len(headers)] * len(headers),
                  hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LINEBELOW", (0, 0), (-1, 0), .5, LINE),
        ]))
        w, h = t.wrap(self.content_width, self.height)
        if self.y - h < 51:
            raise ValueError(f"Table overflow on page {self.page_count}")
        t.drawOn(self.canvas, self.margin, self.y - h)
        self.y -= h + 14

    def screenshot(self, name, max_height=225, caption=""):
        file = ROOT / ".demo" / name
        if not file.exists():
            raise FileNotFoundError(file)
        img = ImageReader(str(file))
        w, h = img.getSize()
        scale = min(self.content_width / w, max_height / h)
        w, h = w * scale, h * scale
        if self.y - h < 65:
            raise ValueError(f"Image overflow on page {self.page_count}")
        x = (self.width - w) / 2
        self.canvas.drawImage(img, x, self.y - h, width=w, height=h)
        self.canvas.setStrokeColor(LINE)
        self.canvas.rect(x, self.y - h, w, h, stroke=1, fill=0)
        self.y -= h + 6
        if caption:
            self.text(caption, size=8, leading=11, color=MUTED, after=10)

    def save(self):
        self.canvas.save()
        shutil.copy2(self.path, PUBLIC / self.path.name)
        return self.path


def manual():
    d = Document("manual-aguiar.pdf", "Aguiar - Manual de uso y guia tecnica")
    d.page("Manual de uso", "Una decision, tres referencias", "Guia operativa y tecnica para usar la web de Aguiar desde cualquier equipo autorizado.")
    d.text("La herramienta ayuda a priorizar revisiones de precios. <b>No modifica listas de venta automaticamente</b> y no reemplaza la aprobacion comercial.", size=12, leading=18)
    d.table(["Referencia", "Que representa", "Para que usarla"], [
        ["Excel", "Precio de venta de Aguiar", "Comparar tu venta con mayoristas. Sin Excel no hay precio propio."],
        ["Tokin / Arcor", "Referencia del proveedor", "Estimar costo ajustado solo con unidad, vigencia y condiciones confirmadas."],
        ["Competencia", "Precios publicados de otras empresas", "Priorizar mayoristas; conservar minoristas como referencia secundaria."],
    ], [100, 188, 223])
    d.heading("Acceso")
    d.text('1. Abri <b><link href="https://preventa-web.vercel.app/guia" color="#153d7b">https://preventa-web.vercel.app/guia</link></b>. Solo necesitas un navegador y conexion a Internet; no instalar ni encender un servidor en tu computadora.')
    d.text("2. Si el navegador pide usuario y contrasena, usa la ficha privada entregada por el administrador. No uses las credenciales de Tokin ni una cookie de Carrefour como clave de la aplicacion.")
    d.text("3. Desde el icono del libro podes volver al manual, descargar los PDF o abrir <b>Ejemplo simulado</b>.")
    d.note("El acceso es privado. El administrador entrega usuario y contrasena por separado; no van dentro de los PDF. Las credenciales de los proveedores se administran en el backend, no son el acceso de gerencia.")
    d.heading("Recorrido recomendado")
    d.text("Estado de datos &gt; importar Excel &gt; revisar unidad y costo &gt; comparar mayoristas &gt; guardar con confirmacion &gt; descargar &gt; aprobar una accion.")
    d.text("Indice: importar (2), interpretar (3), costo y bulto (4), editor visual (5), rutina (6), ejemplo (7), incidencias (8), operacion tecnica (9).", color=MUTED)

    d.page("Importacion", "Cargar la lista de venta", "El Excel es el punto de partida para evaluar el precio real de Aguiar.")
    d.text("1. En <b>Configuracion</b>, revisa Estado para decidir: Excel activo, precios recientes, antiguos, sin fecha y fuentes disponibles. Un cron exitoso no significa que todos los precios sean nuevos.")
    d.text("2. Abri <b>Importacion</b>. Para una prueba deja desmarcado <b>Guardar esta carga para evolucion</b>. Selecciona el archivo y espera que termine el procesamiento de todos los lotes.")
    d.text("3. Revisa descripcion, codigo/EAN, precio Excel y UxB. El archivo del cliente <b>Lista de Articulos - HUMAN.xlsx</b> fue probado con 1.034 articulos; la hoja se llama <b>01-06-2026</b>.")
    d.note("Antes de guardarlo como lista vigente, confirma que sus precios de junio siguen siendo validos. Importar hoy no cambia la antiguedad comercial del archivo.")
    d.screenshot("pilot-importacion-completa.png", 230, "Captura de verificacion con el archivo del cliente. Los datos de mercado de esta prueba son historicos; valida lectura y exportacion, no vigencia comercial.")
    d.text("4. Usa busqueda y filtros. La tabla presenta <b>50 filas por pagina</b>. El boton Resultado XLSX exporta todos los articulos, aunque estes viendo una pagina o un filtro.")
    d.text("5. Guarda solo cuando la lista y las condiciones esten revisadas. Exigi una confirmacion de guardado. Si falla, descarga el resultado y revisa Historial antes de reintentar para evitar duplicados.")

    d.page("Lectura de resultados", "Precio alto no significa bajar", "La diferencia publicada y la accion sugerida contestan preguntas distintas.")
    d.table(["Indicador", "Interpretacion"], [
        ["Excel + mayorista vigente", "Filas que tienen venta y una referencia mayorista comparable reciente."],
        ["Tokin comparable vigente", "Filas con referencia de proveedor utilizable para costo."],
        ["Costo ajustado confirmado", "Filas con condiciones comerciales completas. No equivale a cobertura de mercado."],
        ["Excel arriba &gt;5%", "Tu precio supera al mayorista en mas de 5%. Incluye casos donde aun falta confirmar costo."],
    ], [180, 331])
    d.heading("Diferencia versus mayorista")
    d.text("<b>(Venta Excel - precio mayorista) / precio mayorista x 100</b>. Excel $1.200 y mayorista $1.000 = <b>+20%</b>. Negativo significa que Excel esta mas barato. No es margen.")
    d.table(["Senal", "Lectura y proximo paso"], [
        ["Rojo / costo limita", "Igualar puede comprometer el margen objetivo. Revisar costo, unidad y negociacion."],
        ["Naranja / arriba", "Evaluar un ajuste; antes confirmar costo, condiciones y cobertura."],
        ["Verde / competitivo", "Mantener o monitorear, con referencias comparables."],
        ["Azul / oportunidad", "Evaluar margen disponible, no subir automaticamente."],
        ["Gris / revisar", "Falta Excel, fecha, mayorista o equivalencia. Obtener evidencia antes de decidir."],
    ], [180, 331])
    d.note("Promo, compra minima y precio por bulto cerrado pueden condicionar la oferta. Se marcan para validar; un precio condicionado no debe presentarse como una baja firme.")
    d.text("En <b>Ver fuentes</b> revisa empresa, precio por unidad, precio original/bulto, fecha y condicion. El menor precio solo es util si corresponde al mismo producto y presentacion.")

    d.page("Costo y presentacion", "Unidad, bulto y costo neto", "No compares un paquete completo con una unidad ni recargo con margen.")
    d.text("<b>Ejemplo numerico, no cotizacion actual:</b> bulto Tokin $13.319,47 / 40 unidades = $332,98675 por unidad. En pantalla se redondea a $332,99. El total conserva su precision; 40 x el valor redondeado puede diferir por centavos.")
    d.text("UxB significa unidades por bulto. Se admite 40 o 40 Uds. Un peso como 40 gr, una fraccion o una expresion ambigua como 3x12 requieren aclaracion; no se convierten automaticamente en unidades.")
    d.heading("Condiciones de costo, paso a paso")
    d.text("1. En la fila, abri <b>Condiciones de costo</b>. Confirma si Tokin y Excel incluyen IVA y las tasas aplicables.")
    d.text("2. Completa descuentos adicionales, bonificacion monetaria, IVA recuperable, flete por unidad, financiacion y otros costos. <b>0 = no aplica; vacio = pendiente</b>. No dupliques descuentos ya incluidos.")
    d.text("3. Define margen objetivo sobre venta neta. Revisa costo ajustado y piso de venta. Marca la confirmacion y presiona <b>Aplicar al articulo</b>. Esto modifica la evaluacion, no una lista externa.")
    d.text("<b>Recargo:</b> (venta neta - costo ajustado) / costo ajustado. <b>Margen:</b> (venta neta - costo ajustado) / venta neta. Con costo $800 y venta $1.200, recargo 50% y margen 33,3%.", size=10, leading=14)
    d.note("Es margen estimado, no rentabilidad neta. No incluye gastos que no se hayan informado. Con Tokin desactualizado no se habilita un piso firme.")
    d.heading("Antes de confirmar")
    d.text("Revisa factura y condiciones con el responsable administrativo. El impuesto del proveedor y el de tu venta no se presuponen iguales. Si la presentacion es un display o un pack, confirma que el costo calculado corresponde a la unidad que vendes.")

    d.page("Editor visual", "Confirmar antes de calcular", "Captura del ejemplo simulado DEMO-01. No copiar estas condiciones como datos reales del negocio.")
    d.screenshot("pilot-costos-dialog.png", 570, "La confirmacion habilita Aplicar al articulo. Cambiar un campo exige confirmar nuevamente. Cerrar o Cancelar no aplica la edicion.")

    d.page("Rutina operativa", "Que hacer cada dia", "Las consultas por catalogo leen informacion guardada. La actualizacion es una tarea separada.")
    d.table(["Pantalla", "Uso recomendado"], [
        ["Configuracion", "Comprobar vigencia individual, ultima ejecucion y fuentes sin datos. Actualizar vista relee el estado; no renueva todos los precios."],
        ["Categorias", "Explorar una familia. Consultar la referencia Excel guardada cuando exista y distinguir Tokin como proveedor. Abrir detalle para equivalencias."],
        ["Busqueda general", "Localizar un articulo y sus fuentes. Confirmar unidad y marca antes de tomar la diferencia como comparable."],
        ["Importacion / Revisiones", "Priorizar diferencias de tu venta Excel frente a mayoristas. Resolver faltantes, costo y equivalencias."],
        ["Historial", "Abrir una carga guardada. Revisar fecha, Excel, proveedor y mercado por separado. Una carga incompleta no es referencia activa."],
        ["Evolucion", "Comparar capturas del mismo articulo. Un guion significa dato ausente, no cero. No inventar precios de periodos sin captura."],
        ["Alertas", "Revisar salud del catalogo y senales Tokin/proveedor versus mercado. No son margen Aguiar ni reemplazan la evaluacion Excel."],
    ], [118, 393])
    d.heading("Actualizacion diaria")
    d.text("El cron esta programado para las <b>12:00 de Argentina (15:00 UTC)</b>. El recorrido actual es incremental: cuatro fuentes y dos terminos por fuente; Tokin y Maxiconsumo Chaco son prioritarios y otras fuentes rotan.")
    d.note("No es una descarga completa diaria. Solo un precio efectivamente consultado recibe una nueva fecha de observacion. Las fuentes que requieren sesion pueden fallar; los datos anteriores se conservan con su antiguedad.")
    d.text("Para una decision real, confirma cobertura mayorista y fecha de cada referencia. Si el catalogo es antiguo, asigna la renovacion al responsable tecnico antes de aprobar cambios.")

    d.page("Practica reproducible", "Diez casos para ensayar", "Abri /ejemplo desde Manual y presentacion. No consulta proveedores y no guarda informacion.")
    d.table(["Codigo", "Situacion simulada", "Resultado esperado"], [
        ["DEMO-01", "Excel 1.200 / Tokin 800 / mayorista 1.000", "+20%; revisar baja o promo con costo confirmado."],
        ["DEMO-02", "Excel y mayorista en 1.000", "Competitivo; mantener."],
        ["DEMO-03", "Excel 1.000 / mayorista 1.200", "Oportunidad a evaluar."],
        ["DEMO-04", "Excel 1.200 / costo 1.100 / mayorista 1.000", "Costo limita competir; negociar/revisar."],
        ["DEMO-05", "Tokin 13.319,47 / 40; mayorista 19.000 / 40", "332,99 y 475 por unidad; comparar la misma base."],
        ["DEMO-06", "No hay venta Excel", "Cargar precio propio; no sustituir por Tokin."],
        ["DEMO-07", "Precio de mercado de hace cinco dias", "Actualizar antes de decidir."],
        ["DEMO-08", "Oferta condicionada 2x1", "Validar promo o compra minima."],
        ["DEMO-09", "Solo minorista", "Referencia debil, sin baja firme."],
        ["DEMO-10", "Equivalencia de baja confianza", "Revisar match antes de decidir."],
    ], [64, 230, 217], size=8.5)
    d.heading("Ejercicio de cinco minutos")
    d.text("1. Busca <b>DEMO-01</b>. Verifica +20% frente al mayorista, recargo 50% y margen 33,3% bajo los supuestos sin IVA ni ajustes.")
    d.text("2. Abri Condiciones de costo, cambia <b>Flete por unidad a 300</b>, confirma y aplica. El costo pasa a $1.100; el margen baja a 8,3%. La accion cambia a <b>Negociar costo / revisar match</b>.")
    d.text("3. Presiona <b>Restablecer ejemplo</b>. Verifica que vuelvan los valores iniciales. Repeti con DEMO-05 para revisar unidad/bulto.")
    d.note("Todos los importes y competidores del ejemplo son ficticios. El margen objetivo inicial es 20%; no es una recomendacion para la empresa.")

    d.page("Incidencias", "Cuando no hay evidencia", "No completar faltantes con precios inventados ni tratar una consulta fallida como cero.")
    d.table(["Sintoma", "Que hacer"], [
        ["No aparece precio Excel", "Revisar columna de venta y archivo activo. Tokin no debe ocupar ese lugar."],
        ["Sin fecha / desactualizado", "Pedir renovacion real. Una consolidacion reciente no rejuvenece precios retenidos."],
        ["Carrefour requiere login o precios privados", "Revisar estado de sesion con el administrador. El proveedor puede invalidar cookies o bloquear automatizacion; no se garantiza reconexion permanente."],
        ["Cero resultados en una familia", "Distinguir catalogo sin cobertura, fallo de fuente y filtro sin coincidencias. Revisar producto/EAN y salud de fuente."],
        ["Error 504 o respuesta no valida al importar", "Conservar archivo, anotar hora y lote informado. Reintentar; si persiste, revisar logs de web/worker. No considerar el subconjunto como lista completa."],
        ["Fallo de guardado", "Descargar la evaluacion. Comprobar Historial antes de repetir. No asumir que esta persistida sin confirmacion."],
        ["Falta migracion de alertas", "Administrador: revisar migraciones existentes en Supabase. No pegar claves en capturas o en un documento compartido."],
        ["Historial antiguo sin origen de referencia", "Marcar para revision; no interpretar el precio como venta propia ni el gap como accion validada."],
    ], [167, 344], size=9)
    d.heading("Reporte util para soporte")
    d.text("Pagina, fecha/hora, articulo y codigo/EAN, archivo y cantidad de filas, paso realizado, mensaje exacto y captura sin contrasenas/cookies. Para diferencias de precio: unidad, bulto, fecha y fuente de ambos lados.")
    d.note("No compartir fichas de acceso, cookies de proveedores ni claves de Supabase en el manual o la presentacion.")

    d.page("Guia tecnica", "Operacion y limites del piloto", "Destinado al administrador, no al usuario comercial.")
    d.table(["Componente", "Responsabilidad"], [
        ["Web Next.js", "Acceso, importacion, analisis, historial y proxy privado al worker."],
        ["Worker", "Fuentes y sesiones, catalogo guardado y metadatos de vigencia. La lectura por catalogo no debe lanzar scraping por cada consulta."],
        ["Supabase", "Persistencia de cargas, capturas, revisiones y alertas cuando esta configurado. Validar tablas, permisos y guardado real."],
        ["Cron", "Renovacion incremental, consolidacion y analisis posterior si queda tiempo. Declarar tareas diferidas, no simular finalizacion."],
    ], [114, 397])
    d.text("Variables principales: <b>APP_ACCESS_USERNAME, APP_ACCESS_PASSWORD, WORKER_URL, WORKER_API_SECRET, CRON_SECRET, WORKER_CRON_SECRET, CATEGORY_SEARCH_MODE=catalog, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY</b>. Solo nombres; los valores se entregan y guardan por un canal privado.", size=9, leading=13)
    d.heading("Verificacion antes de publicar")
    d.text("1. Revisar cambios en main. Ejecutar npm test, npm run typecheck y npm run build. Mantener las claves fuera del repositorio y usar las variables de produccion de Vercel.")
    d.text("2. Con aprobacion, publicar web y worker. Verificar acceso anonimo rechazado, lectura de catalogo, importacion completa, guardado confirmado y lectura en Historial. Estas modificaciones no requieren una migracion SQL nueva.")
    d.text("3. Validar el primer cron real: hora, fuentes, productos con observedAt, fallos y tareas diferidas. Probar restauracion y definir responsable para fuentes que pierdan sesion.")
    d.heading("Que falta para escala empresarial")
    d.text("Usuarios y roles individuales; auditoria de aprobaciones; trabajos reanudables con cursor durable y reintentos; unicidad transaccional para evitar duplicados; monitoreo y restauracion probada. Una clave compartida corresponde al piloto, no a control corporativo completo.")
    d.note("Verificado localmente: 157 pruebas, typecheck/build y archivo de 1.034 articulos. La persistencia remota de esta revision y la renovacion completa de precios no estan certificadas. Documentacion ampliada: MANUAL.md y docs/entrega-piloto.md.")
    return d.save()


def presentation():
    d = Document("presentacion-gerencia.pdf", "Aguiar - Propuesta de piloto para gerencia", landscape=True)
    d.page("Propuesta", "Decidir precios con evidencia", "Propuesta de piloto asistido para compras y ventas. No es un sistema de cambios automaticos de precios.")
    d.table(["TU VENTA", "TU PROVEEDOR", "TU MERCADO"], [
        ["<b>Excel Aguiar</b><br/>Precio de venta informado por la empresa.", "<b>Tokin / Arcor</b><br/>Referencia de compra; ajustar condiciones, impuestos y unidad.", "<b>Mayoristas primero</b><br/>Competencia comparable. Minoristas como referencia secundaria."],
        ["¿Estoy caro o competitivo?", "¿Cuanto agrego y que margen queda?", "¿Contra quien y con que evidencia?"],
    ], size=12)
    d.heading("Lo que aporta")
    d.text("Una mesa de revision para encontrar articulos caros, detectar costo insuficiente, revisar equivalencias y evaluar oportunidades. Cada caso conserva fuente, unidad, fecha y motivo de la sugerencia.", size=13, leading=19)
    d.heading("Regla de confianza")
    d.text("Si falta venta, fecha, presentacion equivalente, costo confirmado o cobertura suficiente, la salida es <b>revisar</b>, no una instruccion automatica de bajar o subir.", size=12, leading=18)
    d.note("Acceso al piloto: https://preventa-web.vercel.app/guia. Una web disponible no implica que todos los precios del catalogo esten vigentes: confirmar fecha, cobertura y condiciones antes de decidir.")

    d.page("Demostracion", "El mismo precio, dos decisiones", "Ejemplo simulado reproducible en /ejemplo. No son cotizaciones reales.")
    d.table(["Dato", "Escenario inicial", "Con $300 de flete por unidad"], [
        ["Venta Excel", "$1.200", "$1.200"],
        ["Tokin / costo ajustado", "$800 / $800", "$800 / $1.100"],
        ["Mejor mayorista", "$1.000", "$1.000"],
        ["Diferencia publicada", "+20% frente al mayorista", "+20% frente al mayorista"],
        ["Margen estimado", "33,3%", "8,3%"],
        ["Accion", "Revisar baja o promo", "Negociar costo / revisar match"],
    ], [208, 275, 275], size=11)
    d.text("<b>Conclusion:</b> ver un precio de competencia menor no alcanza para recomendar una baja. La estructura de costo cambia la decision, aunque el gap comercial sea el mismo.", size=13, leading=19)
    d.note("Supuestos pedagogicos: sin IVA ni descuentos; margen objetivo 20%. Recargo y margen usan denominadores distintos. La practica permite modificar condiciones y restablecerlas, sin guardar precios ficticios.")

    d.page("Evidencia y alcance", "Que se puede demostrar hoy", "Separar capacidad funcional de disponibilidad y calidad de datos.")
    d.table(["Verificado en esta entrega", "Limite que debe explicitarse"], [
        ["Importacion y exportacion de los 1.034 articulos del HUMAN; paginacion de 50 sin recortar el archivo.", "La hoja es de junio. No se afirmo que sus precios sigan vigentes ni se activo como lista productiva nueva."],
        ["157 pruebas automatizadas, typecheck y build; navegacion de diez rutas en escritorio y movil.", "Las pruebas de escritura usan una base simulada. Falta verificar guardado y primer cron productivo despues del despliegue."],
        ["Unidad/bulto, fechas, promo y costo condicionan la recomendacion. Alertas distinguen proveedor de venta propia.", "Matching imperfecto y fuentes sin acceso siguen necesitando revision humana."],
        ["Consultas por catalogo guardado y actualizacion incremental diaria.", "No se renueva todo el mercado cada dia. Se requieren trabajos durables para cobertura completa y reintentos."],
    ], [379, 379], size=11)
    d.text("<b>Propuesta honesta:</b> presentar un piloto util para priorizar decisiones, no una plataforma empresarial terminada ni una promesa de ahorro ya medido.", size=13, leading=19)

    d.page("Plan de adopcion", "Validar antes de escalar", "Objetivo del piloto: decisiones trazables con una muestra controlada, no volumen sin evidencia.")
    d.table(["Paso", "Responsable", "Criterio de aceptacion"], [
        ["1. Confirmar base", "Comercial / administracion", "Excel vigente, unidad, impuestos, descuentos, flete y margen objetivo confirmados."],
        ["2. Revisar 20 articulos", "Compras / ventas", "Excel, Tokin y dos mayoristas cuando exista cobertura; fuente, fecha y presentacion verificadas manualmente."],
        ["3. Probar operacion", "Tecnologia", "Acceso, guardado y lectura, cron real, fallos visibles y recuperacion de datos."],
        ["4. Aprobar decisiones", "Gerencia", "Registrar mantener, negociar, ajustar o esperar; sin cambios de precio automaticos."],
    ], [165, 180, 413], size=11)
    d.heading("Medir el resultado del piloto")
    d.text("Cobertura mayorista vigente; proporción de equivalencias confirmadas; tiempo de revision por articulo; decisiones aprobadas y motivos de bloqueo. No confundir brecha de precios con ahorro o ganancia realizada.", size=12, leading=18)
    d.text("<b>Siguiente inversion:</b> datos actuales y cobertura autorizada primero; luego trabajos reanudables, roles individuales, auditoria y monitoreo. Material disponible: manual operativo, ejemplo interactivo y ficha de acceso privada.", size=12, leading=18)
    return d.save()


def private_access():
    access_path = ROOT / ".demo/access.json"
    if not access_path.exists():
        return
    access = json.loads(access_path.read_text())
    private_path = ROOT / ".demo/ACCESO-PRIVADO.txt"
    content = (
        "ACCESO PRIVADO - WEB AGUIAR\n"
        "No adjuntar a los PDF ni publicar. Compartir solo con personas autorizadas.\n\n"
        "URL: https://preventa-web.vercel.app/guia\n"
        f"Usuario: {access['APP_ACCESS_USERNAME']}\n"
        f"Contrasena: {access['APP_ACCESS_PASSWORD']}\n\n"
        "Credencial verificada contra la web de produccion el 22/09/2026.\n"
        "No requiere servidor local ni instalar la aplicacion.\n"
        "Rotar antes de ampliar el acceso. Nunca usar claves de proveedores aqui.\n"
    )
    fd = os.open(private_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(content)
    os.chmod(private_path, 0o600)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for pdf in [manual(), presentation()]:
        print(pdf.relative_to(ROOT))
    private_access()
