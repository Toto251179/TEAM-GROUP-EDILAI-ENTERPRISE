import { useState, useEffect } from "react";

function FotoCantiere() {
  const [cantieri, setCantieri] = useState([]);
  const [foto, setFoto] = useState([]);

  const [nuovaFoto, setNuovaFoto] = useState({
    cantiere: "",
    descrizione: "",
    immagine: "",
    data: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    const datiCantieri =
      JSON.parse(localStorage.getItem("cantieri")) || [];

    const datiFoto =
      JSON.parse(localStorage.getItem("fotoCantiere")) || [];

    setCantieri(datiCantieri);
    setFoto(datiFoto);
  }, []);

  const salvaFoto = (nuoveFoto) => {
    setFoto(nuoveFoto);

    localStorage.setItem(
      "fotoCantiere",
      JSON.stringify(nuoveFoto)
    );
  };

  const caricaImmagine = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setNuovaFoto({
        ...nuovaFoto,
        immagine: reader.result,
      });
    };

    reader.readAsDataURL(file);
  };

  const aggiungiFoto = () => {
    if (
      !nuovaFoto.cantiere ||
      !nuovaFoto.immagine
    )
      return;

    salvaFoto([
      ...foto,
      {
        id: Date.now(),
        ...nuovaFoto,
      },
    ]);

    setNuovaFoto({
      cantiere: "",
      descrizione: "",
      immagine: "",
      data: new Date()
        .toISOString()
        .split("T")[0],
    });
  };

  const eliminaFoto = (id) => {
    salvaFoto(
      foto.filter((f) => f.id !== id)
    );
  };

  return (
    <div>
      <h1>ðŸ“¸ Foto Cantiere PRO</h1>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "20px",
        }}
      >
        <h2>Nuova Foto</h2>

        <select
          value={nuovaFoto.cantiere}
          onChange={(e) =>
            setNuovaFoto({
              ...nuovaFoto,
              cantiere: e.target.value,
            })
          }
        >
          <option value="">
            Seleziona Cantiere
          </option>

          {cantieri.map((c) => (
            <option
              key={c.id}
              value={c.nome}
            >
              {c.nome}
            </option>
          ))}
        </select>

        <br /><br />

        <input
          placeholder="Descrizione"
          value={nuovaFoto.descrizione}
          onChange={(e) =>
            setNuovaFoto({
              ...nuovaFoto,
              descrizione: e.target.value,
            })
          }
        />

        <br /><br />

        <input
          type="file"
          accept="image/*"
          onChange={caricaImmagine}
        />

        <br /><br />

        <button onClick={aggiungiFoto}>
          Salva Foto
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill,minmax(300px,1fr))",
          gap: "20px",
        }}
      >
        {foto.map((f) => (
          <div
            key={f.id}
            style={{
              background: "white",
              padding: "15px",
              borderRadius: "12px",
            }}
          >
            <img
              src={f.immagine}
              alt=""
              style={{
                width: "100%",
                height: "200px",
                objectFit: "cover",
                borderRadius: "8px",
              }}
            />

            <h4>{f.cantiere}</h4>

            <p>{f.descrizione}</p>

            <small>{f.data}</small>

            <br /><br />

            <button
              onClick={() =>
                eliminaFoto(f.id)
              }
            >
              Elimina
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FotoCantiere;
