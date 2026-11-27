export const sampleCsvFileName = 'ticketbox-seats-sample.csv';
export const sampleSvgFileName = 'ticketbox-map-sample.svg';

const csvField = (value: string) =>
  /[",]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;

/** Two sections with three rows of four seats each, inside a 1000 x 600 coordinate space. */
export function seatCsvSample() {
  const lines = ['section,row,seat,x,y'];
  const sections = [
    { code: 'STALLS', left: 100, top: 300, rows: ['A', 'B', 'C'] },
    { code: 'BALCONY', left: 600, top: 300, rows: ['A', 'B', 'C'] },
  ];
  for (const section of sections) {
    for (const [rowIndex, row] of section.rows.entries()) {
      for (let seat = 1; seat <= 4; seat++) {
        // The first row label of the balcony shows a quoted label that contains a comma.
        const label = section.code === 'BALCONY' && row === 'A' ? 'A, front' : row;
        lines.push(
          [
            section.code,
            csvField(label),
            seat,
            section.left + seat * 50,
            section.top + rowIndex * 50,
          ].join(','),
        );
      }
    }
  }
  return lines.join('\n') + '\n';
}

/** A stage, one standing zone and one seated zone with an accessible, a restricted-view and a blocked seat. */
export function layoutSvgSample() {
  const seats = [1, 2, 3, 4, 5, 6]
    .map((seat) => {
      const flags =
        seat === 1
          ? ' data-accessible="true"'
          : seat === 2
            ? ' data-restricted-view="true"'
            : seat === 6
              ? ' data-blocked="true"'
              : '';
      return `<g data-seat="${seat}"${flags}><circle cx="${480 + seat * 40}" cy="400" r="12"/></g>`;
    })
    .join('');
  const secondRow = [1, 2, 3, 4, 5, 6]
    .map((seat) => `<g data-seat="${seat}"><circle cx="${480 + seat * 40}" cy="450" r="12"/></g>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600">
  <g data-shape="STAGE" data-label="Stage"><polygon points="300,20 700,20 700,80 300,80"/></g>
  <g data-kind="GA" data-code="FLOOR" data-label="Standing floor"><polygon points="50,120 450,120 450,540 50,540"/></g>
  <g data-kind="ASSIGNED" data-code="STALLS" data-label="Stalls"><polygon points="500,120 950,120 950,540 500,540"/>
    <g data-row="A" data-label="Row A">${seats}</g>
    <g data-row="B" data-label="Row B">${secondRow}</g>
  </g>
</svg>
`;
}

export function downloadTextFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the browser has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
