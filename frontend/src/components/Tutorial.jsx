const CARDS = [
  ["👋", "Bienvenido/a a tu caja", "Desde aquí ves tu ahorro, tus créditos y los movimientos de la caja, cuando quieras."],
  ["💰", "Tu billetera", "Mira cuánto has depositado, tu ahorro neto, lo que debes y los intereses."],
  ["📄", "Tu estado de cuenta", "Descárgalo cuando quieras en PDF (con membrete) o en Excel."],
  ["⇄", "Solicita un crédito", "Calcula tu cuota, elige el monto y el plazo, y envía la solicitud a la directiva."],
  ["🔒", "Tus datos, seguros", "Para cambiar tus datos envías una solicitud; activa la verificación en dos pasos."],
  ["🔍", "Transparencia", "Revisa la bitácora de la caja: todo queda registrado y a la vista."],
];

export default function Tutorial({ onCerrar }) {
  return (
    <div className="tut-overlay">
      <div className="tut-box">
        <div className="tut-cab">
          <strong>Cómo usar Kullki</strong>
          <button className="tut-skip" onClick={onCerrar}>Saltar</button>
        </div>
        <div className="tut-scroller">
          {CARDS.map((c, i) => (
            <div className="tut-card" key={i}>
              <div className="tut-emoji">{c[0]}</div>
              <div className="tut-tit">{c[1]}</div>
              <div className="tut-txt">{c[2]}</div>
            </div>
          ))}
        </div>
        <div className="tut-pie">Desliza para ver más →</div>
        <button className="boton" onClick={onCerrar}>Entendido, empezar</button>
      </div>
    </div>
  );
}
