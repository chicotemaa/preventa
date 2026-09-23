import Link from "next/link";
import { Download, Play, Settings, FileSpreadsheet } from "lucide-react";

export default function GuidePage() {
  const documents = [
    { href: "/ayuda/manual-aguiar.pdf", title: "Manual de uso", detail: "Acceso, importación, decisiones, historial y resolución de problemas." },
    { href: "/ayuda/presentacion-gerencia.pdf", title: "Presentación a gerencia", detail: "Propuesta, ejemplo, alcance del piloto y criterios de aceptación." },
  ];
  return <main className="min-h-screen bg-[#f5f6f8] px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-[#17202a]">Manual y presentación</h1>
      <p className="mt-2 text-sm text-[#526170]">Aguiar · Asistente de evaluación de precios · Piloto asistido</p>
      <div className="mt-6 divide-y divide-[#d9dee7] border-y border-[#d9dee7]">
        {documents.map(doc => <section key={doc.href} className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div><h2 className="font-bold text-[#17202a]">{doc.title}</h2><p className="mt-1 text-sm text-[#526170]">{doc.detail}</p></div>
          <a href={doc.href} download className="inline-flex items-center gap-2 rounded border border-[#cfd8e3] bg-white px-3 py-2 text-sm font-semibold text-[#153d7b]"><Download className="h-4 w-4" />Descargar PDF</a>
        </section>)}
      </div>
      <nav aria-label="Recursos para la presentación" className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-[#153d7b]">
        <Link className="inline-flex items-center gap-2" href="/ejemplo"><Play className="h-4 w-4" />Ejemplo simulado</Link>
        <Link className="inline-flex items-center gap-2" href="/importacion"><FileSpreadsheet className="h-4 w-4" />Importación</Link>
        <Link className="inline-flex items-center gap-2" href="/configuracion"><Settings className="h-4 w-4" />Estado de los datos</Link>
      </nav>
      <p className="mt-8 border-l-2 border-[#b98223] pl-3 text-sm leading-6 text-[#526170]">El acceso se entrega por separado. Los PDF no incluyen contraseñas, cookies ni claves. El Excel disponible de junio requiere confirmación de vigencia antes de usarlo para decisiones actuales.</p>
    </div>
  </main>;
}
