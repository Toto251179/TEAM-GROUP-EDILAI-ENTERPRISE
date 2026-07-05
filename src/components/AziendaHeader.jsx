import { azienda } from "../config/azienda";

function AziendaHeader({ titolo, sottotitolo }) {
  return (
    <div className="azienda-header">
      {azienda.logoSrc ? (
        <img className="azienda-logo-image" src={azienda.logoSrc} alt={`Logo ${azienda.ragioneSociale}`} />
      ) : (
        <div className="azienda-logo" aria-label="Logo azienda">
          {azienda.logoText}
        </div>
      )}

      {(titolo || sottotitolo) && (
        <div className="azienda-document-title">
          {titolo && <strong>{titolo}</strong>}
          {sottotitolo && <span>{sottotitolo}</span>}
        </div>
      )}
    </div>
  );
}

export default AziendaHeader;
