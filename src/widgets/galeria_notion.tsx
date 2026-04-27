import { renderWidget, usePlugin, useTracker } from '@remnote/plugin-sdk';
import React, { useState, useEffect } from 'react';

// 📂 Estruturas de Dados
interface FiltroAvo {
  valor: string;
  negar: boolean; 
}

interface SubGaleria {
  id: string;
  nome: string;
  filtros: { [key: string]: FiltroAvo };
  corFundo?: string; 
  corTexto?: string; 
  icone?: string;    
}

interface Biblioteca {
  id: string;
  nome: string;
  tagNome: string;
  paginaPaiId: string;
  icone: string;
  corFundo: string;
  corTexto: string;
  propsVisiveis: string[]; 
  subGalerias?: SubGaleria[]; 
  propProgresso?: string;     
  propTotal?: string;         
}

export const GaleriaNotion = () => {
  const plugin = usePlugin();
  
  // 🎛️ ESTADOS PRINCIPAIS
  const [telaAtual, setTelaAtual] = useState<'HOME' | 'CRIAR' | 'EDITAR' | 'VISUALIZAR'>('HOME');
  const [bibliotecas, setBibliotecas] = useState<Biblioteca[]>([]);
  const [bibAtiva, setBibAtiva] = useState<Biblioteca | null>(null); 
  const [bibEditando, setBibEditando] = useState<Biblioteca | null>(null); 
  
  const [fNome, setFNome] = useState('');
  const [fTag, setFTag] = useState('');
  const [fLink, setFLink] = useState('');
  const [fIcone, setFIcone] = useState('📁');
  const [fCorFundo, setFCorFundo] = useState(''); 
  const [fCorTexto, setFCorTexto] = useState(''); 
  const [fPropsVisiveis, setFPropsVisiveis] = useState<string[]>([]); 
  const [fPropProgresso, setFPropProgresso] = useState(''); 
  const [fPropTotal, setFPropTotal] = useState('');

  const [filtrosAtivos, setFiltrosAtivos] = useState<{ [key: string]: FiltroAvo }>({});
  const [modoVisualizacao, setModoVisualizacao] = useState<'GALERIA' | 'LISTA'>('GALERIA');
  const [ordemGeral, setOrdemGeral] = useState<'A-Z' | 'Z-A'>('A-Z');
  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');

  const [modoSalvandoSub, setModoSalvandoSub] = useState(false);
  const [fNomeSub, setFNomeSub] = useState('');
  const [fCorSub, setFCorSub] = useState('#3b82f6'); 
  const [fCorTextoSub, setFCorTextoSub] = useState('#ffffff');
  const [fIconeSub, setFIconeSub] = useState('📁');

  // 🖼️ ESTADOS DE IMAGENS E MODO DE EDIÇÃO UI
  const [capasCustomizadas, setCapasCustomizadas] = useState<{ [key: string]: string }>({});
  const [modoEdicaoCards, setModoEdicaoCards] = useState(false); 

  // 🔄 CARREGAMENTO DO BANCO DE DADOS
  useEffect(() => {
    const carregar = async () => {
      try {
        const salvas = await plugin.storage.getSynced('bibliotecas_v47') as Biblioteca[];
        if (salvas && salvas.length > 0) {
          const ordenadas = [...salvas].sort((a, b) => {
            const numA = a.nome.match(/^\d+/);
            const numB = b.nome.match(/^\d+/);
            if (numA && numB) return parseInt(numA[0], 10) - parseInt(numB[0], 10);
            return a.nome.localeCompare(b.nome);
          });
          setBibliotecas(ordenadas);
        }

        const capas = await plugin.storage.getSynced('capas_customizadas_v1') as { [key: string]: string };
        if (capas) setCapasCustomizadas(capas);
      } catch (e) {}
    };
    carregar();
  }, [plugin]);

  // -------------------------------------------------------------
  // 🛠️ FUNÇÕES DE APOIO E PARSERS 
  // -------------------------------------------------------------
  
  const lerTextoProfundo = async (richText: any): Promise<string> => {
    if (!richText) return "";
    if (typeof richText === 'string') return richText;
    let resultado = "";
    if (Array.isArray(richText)) {
      for (const t of richText) {
        if (typeof t === 'string') { resultado += t; } 
        else if ((t as any).text) { resultado += (t as any).text; } 
        else if ((t as any).url) { resultado += (t as any).url; } 
        else if (((t as any).i === 'q' || (t as any).i === 'rem' || (t as any).i === 'd') && (t as any)._id) {
          try {
            const refRem = await plugin.rem.findOne((t as any)._id);
            if (refRem && refRem.text) resultado += await lerTextoProfundo(refRem.text);
          } catch (e) {}
        }
      }
    }
    return resultado.trim();
  };

  const encontrarCapaSimples = async (rem: any): Promise<string | null> => {
    const extrair = (rt: any): string | null => {
      if (!rt || !Array.isArray(rt)) return null;
      for (const n of rt) {
        const o = n as any;
        if (o && typeof o === 'object' && o.url && typeof o.url === 'string') {
           if (o.url.startsWith('http') || o.url.startsWith('https')) return o.url;
        }
      }
      return null;
    };
    try {
      let c = extrair(rem.text) || extrair(rem.backText);
      if (c) return c;
      const filhos = await (rem as any).getChildrenRem();
      if (filhos) {
        for (const f of filhos) {
          c = extrair(f.text) || extrair(f.backText);
          if (c) return c;
        }
      }
    } catch (e) {}
    return null;
  };

  const extrairPropriedades = async (rem: any) => {
    const props: { label: string, value: string }[] = [];
    try {
      const filhos = await (rem as any).getChildrenRem();
      if (filhos) {
        for (const f of filhos) {
          const label = await lerTextoProfundo(f.text); 
          if (!label || label.length > 35) continue; 
          let value = "";
          const backTextVal = await lerTextoProfundo(f.backText);
          if (backTextVal) { value = backTextVal; } 
          else {
            const vRems = await (f as any).getChildrenRem();
            if (vRems && vRems.length > 0) value = await lerTextoProfundo(vRems[0].text);
          }
          if (value) props.push({ label, value });
        }
      }
    } catch (e) {}
    return props;
  };

  const trackerResult = useTracker(async (reativo) => {
    const bibAlvo = telaAtual === 'VISUALIZAR' ? bibAtiva : (telaAtual === 'EDITAR' ? bibEditando : null);
    if (!bibAlvo) return { filtrados: [], propsDetectadas: [], valoresPorPropriedade: {} };
    try {
      const tag = await (reativo.rem as any).findByName([bibAlvo.tagNome], null);
      if (!tag) return { filtrados: [], propsDetectadas: [], valoresPorPropriedade: {} };
      const todosMarcados = await tag.taggedRem();
      const filtrados = [];
      const propsSet = new Set<string>(); 
      const dictValores: { [key: string]: Set<string> } = {}; 
      for (const item of todosMarcados) {
        let parentNode = (item as any).parent;
        let nodeID = typeof parentNode === 'string' ? parentNode : parentNode?._id;
        let isInside = false; let depth = 0;
        while (nodeID && depth < 5) {
          if (nodeID === bibAlvo.paginaPaiId) { isInside = true; break; }
          try {
            const pRem = await plugin.rem.findOne(nodeID);
            const p = (pRem as any)?.parent;
            nodeID = p ? (typeof p === 'string' ? p : p._id) : null;
          } catch (e) { break; }
          depth++;
        }
        if (isInside) {
          const title = await lerTextoProfundo(item.text); 
          const capa = await encontrarCapaSimples(item);
          const propriedades = await extrairPropriedades(item); 
          propriedades.forEach(p => {
            propsSet.add(p.label);
            if (!dictValores[p.label]) dictValores[p.label] = new Set();
            dictValores[p.label].add(p.value);
          });
          filtrados.push({ rem: item, title, capa, props: propriedades });
        }
      }
      const valoresLimpos: { [key: string]: string[] } = {};
      for (const key in dictValores) { valoresLimpos[key] = Array.from(dictValores[key]).sort(); }
      return { filtrados, propsDetectadas: Array.from(propsSet), valoresPorPropriedade: valoresLimpos };
    } catch (error) { return { filtrados: [], propsDetectadas: [], valoresPorPropriedade: {} }; }
  }, [bibAtiva, bibEditando, telaAtual, bibliotecas]);

  const listaSegura = trackerResult?.filtrados || [];
  const propsDetectadas = trackerResult?.propsDetectadas || [];
  const valoresFiltro = trackerResult?.valoresPorPropriedade || {};

  // -------------------------------------------------------------
  // ⚙️ INTERAÇÕES UI E LÓGICA DE NEGÓCIO
  // -------------------------------------------------------------

  const voltarParaHome = () => { 
    setTelaAtual('HOME'); setFiltrosAtivos({}); setTermoBusca(''); setMostrarBusca(false); setBibAtiva(null); setOrdemGeral('A-Z'); setModoEdicaoCards(false);
  };

  const renderizarIcone = (iconeStr: string, tamanho: number = 24) => {
    if (!iconeStr) return <span style={{ fontSize: `${tamanho}px` }}>📁</span>;
    if (iconeStr.startsWith('http')) return <img src={iconeStr} alt="icon" style={{ width: `${tamanho}px`, height: `${tamanho}px`, objectFit: 'cover', borderRadius: '4px' }} />;
    return <span style={{ fontSize: `${tamanho}px` }}>{iconeStr}</span>;
  };

  const togglePropVisivel = (propName: string) => { 
    setFPropsVisiveis(prev => prev.includes(propName) ? prev.filter(p => p !== propName) : [...prev, propName]); 
  };

  const moverProp = (propName: string, direcao: number) => {
    const index = fPropsVisiveis.indexOf(propName);
    if (index < 0) return;
    const novaOrdem = [...fPropsVisiveis];
    const temp = novaOrdem[index];
    novaOrdem[index] = novaOrdem[index + direcao];
    novaOrdem[index + direcao] = temp;
    setFPropsVisiveis(novaOrdem);
  };

  const handleFiltroChange = (propNome: string, valor: string) => {
    setFiltrosAtivos(prev => ({ ...prev, [propNome]: { valor: valor, negar: false } }));
  };

  const toggleNegacaoFiltro = (propNome: string) => {
    setFiltrosAtivos(prev => {
      const atual = prev[propNome];
      if (!atual || atual.valor === 'TUDO') return prev;
      return { ...prev, [propNome]: { ...atual, negar: !atual.negar } };
    });
  };

  const excluirSubGaleria = async (idParaExcluir: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bibAtiva || !window.confirm("Excluir esta sub-galeria?")) return;
    const bibAtualizada = { ...bibAtiva, subGalerias: (bibAtiva.subGalerias || []).filter(s => s.id !== idParaExcluir) };
    const novaLista = bibliotecas.map(b => b.id === bibAtualizada.id ? bibAtualizada : b);
    setBibliotecas(novaLista);
    setBibAtiva(bibAtualizada);
    await plugin.storage.setSynced('bibliotecas_v47', novaLista);
  };

  const confirmarSalvarSubGaleria = async () => {
    if (!bibAtiva || !fNomeSub.trim()) { plugin.app.toast("Digite um nome!"); return; }
    const novaSub: SubGaleria = { id: Date.now().toString(), nome: fNomeSub.trim(), filtros: { ...filtrosAtivos }, corFundo: fCorSub, corTexto: fCorTextoSub, icone: fIconeSub || '📁' };
    const bibAtualizada = { ...bibAtiva, subGalerias: [...(bibAtiva.subGalerias || []), novaSub] };
    const novaLista = bibliotecas.map(b => b.id === bibAtualizada.id ? bibAtualizada : b);
    setBibliotecas(novaLista); setBibAtiva(bibAtualizada);
    await plugin.storage.setSynced('bibliotecas_v47', novaLista);
    setFiltrosAtivos({}); setModoSalvandoSub(false); setFNomeSub(''); setFIconeSub('📁'); setFCorSub('#3b82f6'); setFCorTextoSub('#ffffff');
  };

  const abrirPaginaMaeFix = async () => {
    if (!bibAtiva?.paginaPaiId) return;
    try {
      const r = await plugin.rem.findOne(bibAtiva.paginaPaiId);
      if (r) await plugin.window.openRem(r); 
    } catch(e) {}
  };

  // 🪄 TRADUTOR DE DATAS DEFINITIVO (HOTFIX V47)
  const formatarValorPill = (label: string, valor: string) => {
    const v = valor.trim();
    const vLower = v.toLowerCase();
    
    if (vLower === 'yes' || vLower === 'sim' || vLower === 'true') return `☑️ ${label}`;
    if (vLower === 'no' || vLower === 'não' || vLower === 'nao' || vLower === 'false') return `⬜ ${label}`;

    // Limpa espaços extras invisíveis do RemNote
    const cleanV = vLower.replace(/[\s\xA0]+/g, ' ');

    const getMesNum = (m: string) => {
      const raw = m.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const meses: { [key: string]: string } = {
        'january': '01', 'jan': '01', 'janeiro': '01',
        'february': '02', 'feb': '02', 'fevereiro': '02',
        'march': '03', 'mar': '03', 'marco': '03',
        'april': '04', 'apr': '04', 'abril': '04', 'abr': '04',
        'may': '05', 'maio': '05', 'mai': '05',
        'june': '06', 'jun': '06', 'junho': '06',
        'july': '07', 'jul': '07', 'julho': '07',
        'august': '08', 'aug': '08', 'agosto': '08', 'ago': '08',
        'september': '09', 'sep': '09', 'setembro': '09', 'set': '09',
        'october': '10', 'oct': '10', 'outubro': '10', 'out': '10',
        'november': '11', 'nov': '11', 'novembro': '11',
        'december': '12', 'dec': '12', 'dezembro': '12', 'dez': '12'
      };
      return meses[raw];
    };

    // 1) Mês Dia, Ano (Ex: "agosto 1°, 2001" | "April 27th, 2026")
    const regexMesPrimeiro = /^([a-zà-ú]+)\s+(\d{1,2})(?:st|nd|rd|th|°|º)?(?:,)?\s+(\d{4})$/i;
    const match1 = cleanV.match(regexMesPrimeiro);
    if (match1) {
      const mesNum = getMesNum(match1[1]);
      if (mesNum) return `📆 ${match1[2].padStart(2, '0')}/${mesNum}/${match1[3]}`;
    }

    // 2) Dia Mês Ano (Ex: "1 de agosto de 2001" | "27 April 2026")
    const regexDiaPrimeiro = /^(\d{1,2})(?:st|nd|rd|th|°|º)?\s+(?:de\s+)?([a-zà-ú]+)(?:,)?\s+(?:de\s+)?(\d{4})$/i;
    const match2 = cleanV.match(regexDiaPrimeiro);
    if (match2) {
      const mesNum = getMesNum(match2[2]);
      if (mesNum) return `📆 ${match2[1].padStart(2, '0')}/${mesNum}/${match2[3]}`;
    }

    // 3) BR (27/04/2026)
    const brDateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const matchBr = cleanV.match(brDateRegex);
    if (matchBr) return `📆 ${matchBr[1].padStart(2, '0')}/${matchBr[2].padStart(2, '0')}/${matchBr[3]}`;

    // 4) ISO (2026-04-27)
    const isoDateRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
    const matchIso = cleanV.match(isoDateRegex);
    if (matchIso) return `📆 ${matchIso[3].padStart(2, '0')}/${matchIso[2].padStart(2, '0')}/${matchIso[1]}`;

    return v;
  };

  const abrirCriacao = () => {
    setFNome(''); setFTag(''); setFLink(''); setFIcone('📁'); setFCorFundo(''); setFCorTexto(''); setFPropsVisiveis([]); setFPropProgresso(''); setFPropTotal('');
    setTelaAtual('CRIAR');
  };

  const abrirEdicao = (bib: Biblioteca, e: React.MouseEvent) => {
    e.stopPropagation(); 
    setBibEditando(bib); setFNome(bib.nome); setFTag(bib.tagNome); setFLink(bib.paginaPaiId); 
    setFIcone(bib.icone); setFCorFundo(bib.corFundo || ''); setFCorTexto(bib.corTexto || '');
    setFPropsVisiveis(bib.propsVisiveis || []); setFPropProgresso(bib.propProgresso || ''); setFPropTotal(bib.propTotal || '');
    setTelaAtual('EDITAR'); 
  };

  const salvarBiblioteca = async () => {
    if (!fNome.trim() || !fTag.trim() || !fLink.trim()) { plugin.app.toast("Preencha Nome, Tag e Link!"); return; }
    let idLimpo = fLink.trim();
    if (idLimpo.includes('/')) idLimpo = idLimpo.split('/').pop() || idLimpo;

    const dadosSalvos: Biblioteca = {
      id: bibEditando && telaAtual === 'EDITAR' ? bibEditando.id : Date.now().toString(),
      nome: fNome.trim(), tagNome: fTag.trim(), paginaPaiId: idLimpo,
      icone: fIcone.trim() || '📁', corFundo: fCorFundo, corTexto: fCorTexto,
      propsVisiveis: fPropsVisiveis, propProgresso: fPropProgresso, propTotal: fPropTotal,
      subGalerias: bibEditando ? (bibEditando.subGalerias || []) : []
    };

    const novaLista = telaAtual === 'EDITAR' && bibEditando ? bibliotecas.map(b => b.id === bibEditando.id ? dadosSalvos : b) : [...bibliotecas, dadosSalvos];
    const ordenadas = novaLista.sort((a, b) => {
      const numA = a.nome.match(/^\d+/);
      const numB = b.nome.match(/^\d+/);
      if (numA && numB) return parseInt(numA[0], 10) - parseInt(numB[0], 10);
      return a.nome.localeCompare(b.nome);
    });

    setBibliotecas(ordenadas);
    await plugin.storage.setSynced('bibliotecas_v47', ordenadas);
    setTelaAtual('HOME');
  };

  const excluirBiblioteca = async () => {
    if (bibEditando && window.confirm(`Excluir '${bibEditando.nome}'?`)) {
      const novaLista = bibliotecas.filter(b => b.id !== bibEditando.id);
      setBibliotecas(novaLista);
      await plugin.storage.setSynced('bibliotecas_v47', novaLista);
      setTelaAtual('HOME');
    }
  };

  const handleUploadCapa = (remId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (file.type === 'image/gif') {
        setCapasCustomizadas(prev => {
          const newState = { ...prev, [remId]: result };
          plugin.storage.setSynced('capas_customizadas_v1', newState);
          return newState;
        });
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400; let width = img.width; let height = img.height;
        if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
        else { if (height > 500) { width *= 500 / height; height = 500; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx?.drawImage(img, 0, 0, width, height);
        const base64Str = canvas.toDataURL('image/jpeg', 0.8);
        setCapasCustomizadas(prev => {
          const newState = { ...prev, [remId]: base64Str };
          plugin.storage.setSynced('capas_customizadas_v1', newState);
          return newState;
        });
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoverCapa = (remId: string, e: React.MouseEvent) => {
     e.stopPropagation();
     setCapasCustomizadas(prev => {
        const newState = { ...prev }; delete newState[remId];
        plugin.storage.setSynced('capas_customizadas_v1', newState);
        return newState;
     });
  };

  const verificarFiltros = (item: any, regras: { [key: string]: FiltroAvo }) => {
    for (const propFiltro in regras) {
      const regra = regras[propFiltro];
      if (regra.valor === "TUDO") continue;
      const propDoItem = item.props.find((p: any) => p.label === propFiltro);
      const temOValor = propDoItem && propDoItem.value === regra.valor;
      if (regra.negar) { if (temOValor) return false; } else { if (!temOValor) return false; }
    }
    return true;
  };

  const ordenarItens = (itens: any[]) => {
    return [...itens].sort((a, b) => {
      const tA = (a.title || "").toLowerCase(); const tB = (b.title || "").toLowerCase();
      return ordemGeral === 'A-Z' ? tA.localeCompare(tB) : tB.localeCompare(tA);
    });
  };

  const itensVisiveis = ordenarItens(listaSegura.filter((item: any) => {
    if (termoBusca.trim() !== '') { if (!(item.title || "").toLowerCase().includes(termoBusca.toLowerCase())) return false; }
    return verificarFiltros(item, filtrosAtivos);
  }));

  const renderizarGridIndependente = (itensBrutos: any[], bib: Biblioteca) => {
    const itens = ordenarItens(itensBrutos);
    if (itens.length === 0) return <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5, border: '1px dashed var(--rn-border-color)', borderRadius: '8px' }}>Vazio</div>;
    return (
      <div className={modoVisualizacao === 'GALERIA' ? "gallery-grid" : "list-container"}>
        {itens.map((item: any) => {
          const propsParaMostrar = (bib.propsVisiveis || []).map(nomeProp => item.props.find((p: any) => p.label === nomeProp)).filter(Boolean); 
          let progressPct = null; let corProg = '#3b82f6'; let textMotiv = '';
          
          if (bib.propProgresso && bib.propTotal) {
            const vA = parseInt((item.props.find((p: any) => p.label === bib.propProgresso)?.value || '0').replace(/\D/g, ''), 10);
            const vT = parseInt((item.props.find((p: any) => p.label === bib.propTotal)?.value || '0').replace(/\D/g, ''), 10);
            if (!isNaN(vA) && !isNaN(vT) && vT > 0) {
              progressPct = Math.min(100, Math.max(0, (vA / vT) * 100));
              if (progressPct < 60) { corProg = '#ef4444'; textMotiv = '🌱 Começando'; } 
              else if (progressPct < 70) { corProg = '#06b6d4'; textMotiv = '🚀 Pegando ritmo'; } 
              else if (progressPct < 100) { corProg = '#84cc16'; textMotiv = '🔥 Quase lá!'; } 
              else { corProg = '#10b981'; textMotiv = '🏆 Concluído!'; }
            }
          }
          
          const imagemFinal = capasCustomizadas[item.rem._id] || item.capa;
          return (
            <div key={item.rem._id} className={modoVisualizacao === 'GALERIA' ? "gallery-card card-hover" : "list-row"} onClick={() => plugin.window.openRem(item.rem).catch(() => {})}>
              {modoVisualizacao === 'GALERIA' && (
                <div className="cover-container">
                  {imagemFinal ? <img src={imagemFinal} className="gallery-cover" /> : <div className="gallery-cover-placeholder">📸</div>}
                  {modoEdicaoCards && (
                    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: '5px' }}>
                      <label className="upload-btn" onClick={e => e.stopPropagation()} title="Upload (Suporta GIFs)">🖼️<input type="file" accept="image/*" style={{display: 'none'}} onChange={(e) => handleUploadCapa(item.rem._id, e)} /></label>
                      {capasCustomizadas[item.rem._id] && <button className="upload-btn" onClick={(e) => handleRemoverCapa(item.rem._id, e)}>🗑️</button>}
                    </div>
                  )}
                </div>
              )}
              <div className="gallery-content">
                {progressPct !== null && (
                  <div style={{ marginBottom: '8px', padding: '0 2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', opacity: 0.7 }}><span>{textMotiv}</span><span>{Math.round(progressPct)}%</span></div>
                    <div style={{ width: '100%', background: 'var(--rn-background-primary)', height: '6px', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--rn-border-color)' }}><div style={{ width: `${progressPct}%`, background: corProg, height: '100%', transition: 'width 0.4s ease' }} /></div>
                  </div>
                )}
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--rn-text-color)' }}>{item.title || "Sem Título"}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '4px' }}>
                  {propsParaMostrar.map((p: any, idx: number) => {
                    const isLink = p.value.startsWith('http');
                    if (isLink) return <a key={idx} href={p.value} target="_blank" rel="noopener noreferrer" className="prop-pill link-pill" onClick={e => e.stopPropagation()} title={p.label}>🔗 {p.label}</a>;
                    return <span key={idx} className="prop-pill" title={p.label}>{formatarValorPill(p.label, p.value)}</span>;
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const estilosGlobais = `
    .main-container { 
      box-sizing: border-box;
      width: 100%;
      height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 20px; 
      padding-bottom: 120px; 
      background-color: var(--rn-background-primary); 
      color: var(--rn-text-color); 
      font-family: var(--rn-font-family); 
      position: relative;
    }
    
    .input-clean { width: 100%; padding: 10px; margin-bottom: 10px; background-color: var(--rn-background-primary); color: var(--rn-text-color); border: 1px solid var(--rn-border-color); border-radius: 6px; box-sizing: border-box; }
    .card-hover:hover { transform: translateY(-3px); box-shadow: 0 6px 12px rgba(0,0,0,0.15); border-color: #3b82f6 !important; }
    .btn-voltar { background: transparent; border: none; cursor: pointer; color: var(--rn-text-color-secondary); font-weight: bold; display: flex; alignItems: center; gap: 5px; padding: 0; }
    
    .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; width: 100%; }
    .gallery-card { background-color: var(--rn-background-secondary); border: 1px solid var(--rn-border-color); border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; color: var(--rn-text-color); }
    
    .cover-container { position: relative; width: 100%; height: 140px; background: var(--rn-background-primary); border-bottom: 1px solid var(--rn-border-color); }
    .gallery-cover { width: 100%; height: 100%; object-fit: cover; }
    .gallery-cover-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; opacity: 0.3; font-size: 32px; }
    .upload-btn { background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 4px; padding: 4px; font-size: 14px; cursor: pointer; backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
    .card-hover:hover .upload-btn { opacity: 1; }

    .gallery-content { padding: 12px; display: flex; flex-direction: column; }
    .list-container { display: flex; flex-direction: column; gap: 8px; width: 100%; }
    .list-row { background-color: var(--rn-background-secondary); color: var(--rn-text-color); border: 1px solid var(--rn-border-color); border-radius: 8px; padding: 12px 16px; cursor: pointer; transition: all 0.2s ease; }
    .list-row:hover { border-color: #3b82f6 !important; background-color: var(--rn-hover-background-color); }
    
    .prop-pill { display: inline-flex; align-items: center; padding: 2px 8px; margin: 6px 6px 0 0; background-color: var(--rn-hover-background-color); color: var(--rn-text-color-secondary); border-radius: 4px; font-size: 11px; border: 1px solid var(--rn-border-color); cursor: help; }
    .link-pill { color: #3b82f6; text-decoration: none; cursor: pointer; transition: 0.2s; font-weight: bold; }
    .link-pill:hover { text-decoration: underline; background-color: rgba(59, 130, 246, 0.1); border-color: #3b82f6; }
    
    .btn-mover { background: transparent; border: none; cursor: pointer; opacity: 0.5; font-size: 12px; }
    .btn-mover:hover:not(:disabled) { opacity: 1; }
    
    .filter-bar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; padding: 10px; background: var(--rn-background-secondary); border-radius: 8px; border: 1px solid var(--rn-border-color); align-items: center; width: 100%; box-sizing: border-box;}
    
    .filter-select { padding: 6px; border-radius: 4px; background: var(--rn-background-primary); color: var(--rn-text-color); border: 1px solid var(--rn-border-color); font-size: 12px; cursor: pointer; outline: none;}
    
    .top-action-btn { background: transparent; border: none; cursor: pointer; font-size: 18px; opacity: 0.6; padding: 4px; border-radius: 4px; }
    .top-action-btn:hover { background: var(--rn-hover-background-color); opacity: 1; }
    .search-input { background: var(--rn-background-primary); border: 1px solid var(--rn-border-color); color: var(--rn-text-color); padding: 6px 12px; border-radius: 6px; width: 160px; font-size: 13px; outline: none; }
    
    .subgaleria-details { margin-bottom: 15px; border: 1px solid var(--rn-border-color); border-radius: 10px; overflow: hidden; width: 100%; box-sizing: border-box;}
    .subgaleria-summary { padding: 12px 15px; cursor: pointer; font-weight: bold; font-size: 15px; display: flex; align-items: center; gap: 10px; outline: none; }
    .subgaleria-summary:hover { opacity: 0.9; }
    .subgaleria-content { padding: 15px; border-top: 1px solid var(--rn-border-color); background: var(--rn-background-primary); color: var(--rn-text-color); }
    
    .btn-negacao { background: var(--rn-background-primary); border: 1px solid var(--rn-border-color); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .btn-negacao.ativo { background: #ef4444; color: white; border-color: #ef4444; }

    @media (max-width: 600px) {
      .gallery-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
      .search-input { width: 100%; }
    }
  `;

  return (
    <div className="main-container">
      <style>{estilosGlobais}</style>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--rn-border-color)', paddingBottom: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {telaAtual === 'HOME' ? <h1 style={{ fontSize: '20px', margin: 0 }}>📚 Estante</h1> : <button className="btn-voltar" onClick={voltarParaHome}>← Voltar</button>}
        {telaAtual === 'HOME' && <button onClick={abrirCriacao} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>+ Nova</button>}
      </div>

      {/* TELA: HOME */}
      {telaAtual === 'HOME' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
          {bibliotecas.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--rn-text-color-secondary)', border: '1px dashed var(--rn-border-color)', borderRadius: '10px' }}>Ainda não há bibliotecas.</div>
          ) : (
            bibliotecas.map(b => (
              <div key={b.id} className="card-hover" onClick={() => { setBibAtiva(b); setTelaAtual('VISUALIZAR'); }} 
                style={{ backgroundColor: b.corFundo || 'var(--rn-background-secondary)', color: b.corTexto || 'var(--rn-text-color)', border: '1px solid var(--rn-border-color)', borderRadius: '10px', padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ background: 'rgba(0,0,0,0.05)', padding: '8px', borderRadius: '8px', display: 'flex' }}>{renderizarIcone(b.icone, 24)}</div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{b.nome}</div>
                    <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>Filtro: #{b.tagNome}</div>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setBibEditando(b); setFNome(b.nome); setFTag(b.tagNome); setFLink(b.paginaPaiId); setFIcone(b.icone); setFCorFundo(b.corFundo); setFCorTexto(b.corTexto); setFPropsVisiveis(b.propsVisiveis || []); setFPropProgresso(b.propProgresso || ''); setFPropTotal(b.propTotal || ''); setTelaAtual('EDITAR'); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>⚙️</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* TELA: CRIAR/EDITAR */}
      {(telaAtual === 'CRIAR' || telaAtual === 'EDITAR') && (
        <div style={{ background: 'var(--rn-background-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--rn-border-color)' }}>
          <div style={{display:'flex', justifyContent:'space-between'}}>
            <h3>{telaAtual === 'CRIAR' ? '✨ Nova Biblioteca' : '⚙️ Editar Biblioteca'}</h3>
            {telaAtual === 'EDITAR' && <button onClick={excluirBiblioteca} style={{background:'#ef4444', color:'white', border:'none', padding:'4px 10px', borderRadius:4, cursor:'pointer', fontWeight:'bold', fontSize:11}}>Excluir 🗑️</button>}
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ width: '25%' }}><label style={{ fontSize: '11px', fontWeight: 'bold' }}>Ícone</label><input value={fIcone} onChange={e => setFIcone(e.target.value)} className="input-clean" /></div>
            <div style={{ width: '75%' }}><label style={{ fontSize: '11px', fontWeight: 'bold' }}>Nome</label><input value={fNome} onChange={e => setFNome(e.target.value)} className="input-clean" /></div>
          </div>
          <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Tag Exata</label><input value={fTag} onChange={e => setFTag(e.target.value)} className="input-clean" />
          <label style={{ fontSize: '11px', fontWeight: 'bold' }}>URL da Página</label><input value={fLink} onChange={e => setFLink(e.target.value)} className="input-clean" />
          <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
            <label style={{fontSize:11}}><input type="color" value={fCorFundo || '#ffffff'} onChange={e => setFCorFundo(e.target.value)} /> Fundo</label>
            <label style={{fontSize:11}}><input type="color" value={fCorTexto || '#000000'} onChange={e => setFCorTexto(e.target.value)} /> Texto</label>
          </div>

          {propsDetectadas.length > 0 && (
            <div style={{ marginTop: '10px', paddingTop: '15px', borderTop: '1px solid var(--rn-border-color)' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#3b82f6', display: 'block', marginBottom: '10px' }}>📊 Configurar Barra de Progresso:</label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', opacity: 0.8 }}>Progresso Atual</label>
                  <select className="input-clean" value={fPropProgresso} onChange={e => setFPropProgresso(e.target.value)}>
                    <option value="">Nenhuma</option>
                    {propsDetectadas.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', opacity: 0.8 }}>Total Esperado</label>
                  <select className="input-clean" value={fPropTotal} onChange={e => setFPropTotal(e.target.value)}>
                    <option value="">Nenhuma</option>
                    {propsDetectadas.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>Propriedades no Cartão (Marque e ordene):</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px', maxHeight: '250px', overflowY: 'auto', paddingRight: '5px', border: '1px solid var(--rn-border-color)', borderRadius: '8px', padding: '10px' }}>
                {fPropsVisiveis.map((p, idx) => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--rn-background-primary)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--rn-border-color)' }}>
                    <input type="checkbox" checked onChange={() => togglePropVisivel(p)} style={{ cursor: 'pointer' }} />
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: 'bold' }}>{p}</span>
                    <button className="btn-mover" disabled={idx === 0} onClick={() => moverProp(p, -1)}>⬆️</button>
                    <button className="btn-mover" disabled={idx === fPropsVisiveis.length - 1} onClick={() => moverProp(p, 1)}>⬇️</button>
                  </div>
                ))}
                {propsDetectadas.filter(p => !fPropsVisiveis.includes(p)).map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px' }}>
                    <input type="checkbox" checked={false} onChange={() => togglePropVisivel(p)} style={{ cursor: 'pointer' }} />
                    <span style={{ flex: 1, fontSize: '13px', opacity: 0.6 }}>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={salvarBiblioteca} style={{ width: '100%', marginTop: '10px', padding: '12px', background: '#10b981', color: 'white', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Salvar</button>
        </div>
      )}

      {/* TELA: VISUALIZAR */}
      {telaAtual === 'VISUALIZAR' && bibAtiva && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
             <h2 style={{margin:0, display:'flex', alignItems:'center', gap:10}}>{renderizarIcone(bibAtiva.icone, 26)} {bibAtiva.nome}</h2>
             <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                
                <button 
                  className="top-action-btn" 
                  onClick={() => setModoEdicaoCards(!modoEdicaoCards)} 
                  style={{ background: modoEdicaoCards ? 'var(--rn-hover-background-color)' : 'transparent', border: modoEdicaoCards ? '1px solid #3b82f6' : 'none' }} 
                  title="Ativar Edição de Capas"
                >
                  🛠️
                </button>

                {mostrarBusca && <input className="search-input" value={termoBusca} onChange={e => setTermoBusca(e.target.value)} autoFocus placeholder="Busca..." />}
                <button className="top-action-btn" onClick={() => setMostrarBusca(!mostrarBusca)} title="Pesquisar">🔍</button>
                <select className="filter-select" value={ordemGeral} onChange={e => setOrdemGeral(e.target.value as any)}><option value="A-Z">A-Z</option><option value="Z-A">Z-A</option></select>
                <button className="top-action-btn" onClick={() => setModoVisualizacao(modoVisualizacao === 'GALERIA' ? 'LISTA' : 'GALERIA')} title="Alternar Visão">{modoVisualizacao === 'GALERIA' ? '≣' : '⊞'}</button>
                
                <button className="top-action-btn" onClick={abrirPaginaMaeFix} title="Abrir Raiz">↗️</button>
             </div>
          </div>

          <div className="filter-bar">
            {bibAtiva.propsVisiveis.map(p => {
               const opcoes = valoresFiltro[p] || [];
               if (opcoes.length === 0) return null;
               const filtroAtivo = filtrosAtivos[p];
               const temFiltro = filtroAtivo && filtroAtivo.valor !== "TUDO";

               return (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <select className="filter-select" value={filtroAtivo?.valor || "TUDO"} onChange={e => handleFiltroChange(p, e.target.value)}>
                    <option value="TUDO">{p}</option>
                    {opcoes.map(v => <option key={v} value={v}>{formatarValorPill(p, v)}</option>)}
                  </select>
                  {temFiltro && (
                    <button className={`btn-negacao ${filtroAtivo.negar ? 'ativo' : ''}`} onClick={() => toggleNegacaoFiltro(p)} title="Alternar Igual/Diferente">
                      {filtroAtivo.negar ? '≠' : '='}
                    </button>
                  )}
                </div>
               );
            })}
            
            {modoSalvandoSub ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto', background: 'var(--rn-background-primary)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--rn-border-color)', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Ícone" value={fIconeSub} onChange={e => setFIconeSub(e.target.value)} style={{ width: '40px', padding: '4px', fontSize: '12px', border: '1px solid var(--rn-border-color)', borderRadius: '4px' }} />
                <input type="text" placeholder="Nome da pasta" value={fNomeSub} onChange={e => setFNomeSub(e.target.value)} style={{ padding: '4px', fontSize: '12px', border: '1px solid var(--rn-border-color)', borderRadius: '4px' }} autoFocus />
                <input type="color" value={fCorSub} onChange={e => setFCorSub(e.target.value)} style={{ width: '22px', height: '22px', border: 'none', cursor: 'pointer', padding: 0 }} title="Cor Fundo" />
                <input type="color" value={fCorTextoSub} onChange={e => setFCorTextoSub(e.target.value)} style={{ width: '22px', height: '22px', border: 'none', cursor: 'pointer', padding: 0 }} title="Cor Texto" />
                <button onClick={confirmarSalvarSubGaleria} style={{ fontSize: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontWeight: 'bold' }}>Salvar</button>
                <button onClick={() => setModoSalvandoSub(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>❌</button>
              </div>
            ) : (
              Object.keys(filtrosAtivos).some(k => filtrosAtivos[k] && filtrosAtivos[k].valor !== "TUDO") && (
                <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                  <button onClick={() => setModoSalvandoSub(true)} style={{ fontSize: '12px', background: '#10b981', color: 'white', padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>💾 Salvar como Pasta</button>
                  <button onClick={() => setFiltrosAtivos({})} style={{ fontSize: '12px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', textDecoration: 'underline' }}>Limpar Filtros</button>
                </div>
              )
            )}
          </div>

          {bibAtiva.subGalerias?.map(sub => (
            <details key={sub.id} className="subgaleria-details" style={{ backgroundColor: sub.corFundo || 'var(--rn-background-secondary)' }}>
              <summary className="subgaleria-summary" style={{ color: sub.corTexto || 'inherit' }}>
                <span style={{flex: 1, display:'flex', alignItems:'center', gap:'10px'}}>
                  {renderizarIcone(sub.icone || '📁', 18)} {sub.nome} 
                  <span style={{fontSize:'12px', opacity:0.8}}>({listaSegura.filter(i => verificarFiltros(i, sub.filtros)).length})</span>
                </span>
                <button onClick={(e) => excluirSubGaleria(sub.id, e)} style={{ background: 'transparent', border: 'none', color: sub.corTexto || 'inherit', cursor: 'pointer', fontSize: '14px', opacity: 0.7 }} title="Excluir Pasta">🗑️</button>
              </summary>
              <div className="subgaleria-content">
                {renderizarGridIndependente(listaSegura.filter(i => verificarFiltros(i, sub.filtros)), bibAtiva)}
              </div>
            </details>
          ))}

          <h3 style={{ opacity: 0.4, marginTop: '30px', fontSize: '13px', textTransform: 'uppercase' }}>
            Visão Geral ({itensVisiveis.length})
          </h3>
          {renderizarGridIndependente(itensVisiveis, bibAtiva)}
        </div>
      )}
    </div>
  );
};

renderWidget(GaleriaNotion);