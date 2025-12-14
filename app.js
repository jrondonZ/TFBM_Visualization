// app.js
// Linked heatmap + bar chart for tfbs_summary_top40.json

const state = {
  data: null,
  tfCount: 40,
  pinned: null, // {tissue, tf}
  hovered: null
};

const fmt = d3.format(",");
const fmt2 = d3.format(".2f");

const tooltip = d3.select('body')
  .append('div')
  .attr('class', 'tooltip')
  .style('opacity', 0);

function signedColor(score){
  // score in [-1, 1] => diverging RdBu (cool for negative, warm for positive)
  return d3.interpolateRdBu(1 - (score + 1) / 2); // reverse so warm=positive
}

function loadData(){
  return d3.json('tfbs_summary_top40.json');
}

function drawLegend(){
  const w = 280, h = 16, pad = 10;
  const svg = d3.select('#legendSvg');
  svg.selectAll('*').remove();

  const defs = svg.append('defs');
  const grad = defs.append('linearGradient')
    .attr('id','grad')
    .attr('x1','0%').attr('x2','100%')
    .attr('y1','0%').attr('y2','0%');

  const stops = d3.range(0, 1.0001, 0.1);
  grad.selectAll('stop')
    .data(stops)
    .enter().append('stop')
    .attr('offset', d => `${d*100}%`)
    .attr('stop-color', d => signedColor(d*2 - 1));

  svg.append('rect')
    .attr('x', pad).attr('y', 10)
    .attr('width', w - pad*2).attr('height', h)
    .attr('rx', 6)
    .attr('fill','url(#grad)')
    .attr('stroke','rgba(255,255,255,.25)');

  const scale = d3.scaleLinear().domain([-1,1]).range([pad, w-pad]);
  const axis = d3.axisBottom(scale)
    .tickValues([-1,-0.5,0,0.5,1])
    .tickFormat(d3.format("+.1f"));

  svg.append('g')
    .attr('class','axis')
    .attr('transform',`translate(0, ${10+h})`)
    .call(axis);

  svg.append('text')
    .attr('x', pad)
    .attr('y', 9)
    .attr('fill', 'rgba(255,255,255,.65)')
    .attr('font-size', 11)
    .text('signed proportion (unitless)');
}

function subsetData(){
  // Create a view using first state.tfCount TFs from original ordering
  const full = state.data;
  const tfs = full.tfs.slice(0, state.tfCount);
  const tfSet = new Set(tfs);
  const matrix = full.matrix.filter(d => tfSet.has(d.tf));

  // recompute max_total for circle sizing in subset
  const max_total = d3.max(matrix, d => d.total);
  
  // per_tf subset
  const per_tf = full.per_tf.filter(d => tfSet.has(d.tf));
  
  return {
    ...full,
    tfs,
    matrix,
    max_total,
    per_tf
  };
}

function updateDetails(d, mode){
  if(!d){
    d3.select('#detailsText').text('No selection yet.');
    d3.select('#status').text('Hover a cell, or click to pin');
    drawMini(null);
    return;
  }
  const direction = d.score > 0 ? 'more + (enriched)' : (d.score < 0 ? 'more − (depleted)' : 'balanced');
  const imputedTxt = d.imputed ? 'Yes (structural zero)' : 'No';

  d3.select('#status').text(mode === 'pin' ? 'Pinned selection (click a different cell to change)' : 'Hovering (click to pin)');

  d3.select('#detailsText').html(
    `<b>Tissue:</b> ${d.tissue}<br/>
     <b>TF:</b> ${d.tf}<br/>
     <b>Counts (records):</b> + ${fmt(d.plus)} / − ${fmt(d.minus)} / unknown ${fmt(d.unknown)}<br/>
     <b>Total (records):</b> ${fmt(d.total)}<br/>
     <b>Signed proportion:</b> ${fmt2(d.score)} (${direction})<br/>
     <b>Imputed?</b> ${imputedTxt}`
  );
  drawMini(d);
}

function drawMini(d){
  const svg = d3.select('#miniSvg');
  svg.selectAll('*').remove();
  const w = +svg.attr('width');
  const h = +svg.attr('height');

  const margin = {top:10, right:10, bottom:22, left:34};
  const iw = w - margin.left - margin.right;
  const ih = h - margin.top - margin.bottom;

  const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);

  const cats = ['plus','minus','unknown'];
  const values = d ? [d.plus, d.minus, d.unknown] : [0,0,0];
  const colors = {plus:'#b40426', minus:'#3b4cc0', unknown:'#9aa7c7'};

  const x = d3.scaleBand().domain(cats).range([0, iw]).padding(0.28);
  const y = d3.scaleLinear().domain([0, d3.max(values) || 1]).nice().range([ih, 0]);

  g.append('g').attr('class','axis')
    .attr('transform',`translate(0,${ih})`)
    .call(d3.axisBottom(x).tickFormat(k => k==='plus'?'+':(k==='minus'?'−':'?')));

  g.append('g').attr('class','axis')
    .call(d3.axisLeft(y).ticks(4).tickFormat(fmt));

  g.append('text')
    .attr('x', -margin.left)
    .attr('y', -2)
    .attr('fill','rgba(255,255,255,.65)')
    .attr('font-size', 11)
    .text('Count (records)');

  g.selectAll('rect')
    .data(cats.map((k,i)=>({k, v:values[i]})))
    .enter().append('rect')
    .attr('x', d => x(d.k))
    .attr('y', d => y(d.v))
    .attr('width', x.bandwidth())
    .attr('height', d => ih - y(d.v))
    .attr('rx', 6)
    .attr('fill', d => colors[d.k])
    .attr('opacity', d ? 0.95 : 0.25);

  if(d && d.imputed){
    g.append('text')
      .attr('x', iw)
      .attr('y', 10)
      .attr('text-anchor', 'end')
      .attr('fill', '#ffcc66')
      .attr('font-size', 11)
      .text('imputed structural zero');
  }
}

function render(){
  const data = subsetData();
  drawLegend();
  drawHeatmap(data);
  // default bar chart uses first TF
  const tf0 = data.tfs[0];
  drawBars(data, tf0);
  updateDetails(null);
}

function drawHeatmap(data){
  const svg = d3.select('#heatSvg');
  svg.selectAll('*').remove();

  // responsive size
  const container = document.getElementById('heatmap');
  const width = container.clientWidth - 24;
  const height = container.clientHeight - 64;

  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const margin = {top: 50, right: 20, bottom: 20, left: 120};
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(data.tfs).range([0, iw]).paddingInner(0.06);
  const y = d3.scaleBand().domain(data.tissues).range([0, ih]).paddingInner(0.08);

  // size scale based on total count (records)
  const r = d3.scaleSqrt().domain([0, data.max_total || 1]).range([0, Math.min(x.bandwidth(), y.bandwidth())*0.48]);

  // axes
  const xAxis = d3.axisTop(x).tickSize(0).tickPadding(6);
  const yAxis = d3.axisLeft(y).tickSize(0).tickPadding(6);

  g.append('g')
    .attr('class','axis')
    .call(xAxis)
    .selectAll('text')
      .attr('transform','rotate(-35)')
      .attr('text-anchor','start')
      .attr('dx','0.35em')
      .attr('dy','-0.25em');

  g.append('g')
    .attr('class','axis')
    .call(yAxis);

  // axis labels with units (ethical requirement)
  g.append('text')
    .attr('x', -margin.left + 2)
    .attr('y', -32)
    .attr('fill','rgba(255,255,255,.65)')
    .attr('font-size', 12)
    .text('Tissue');

  g.append('text')
    .attr('x', iw)
    .attr('y', -32)
    .attr('text-anchor','end')
    .attr('fill','rgba(255,255,255,.65)')
    .attr('font-size', 12)
    .text('Transcription factor (top-N by frequency)');

  // background grid
  g.append('g').selectAll('rect')
    .data(data.matrix)
    .enter().append('rect')
    .attr('x', d => x(d.tf))
    .attr('y', d => y(d.tissue))
    .attr('width', x.bandwidth())
    .attr('height', y.bandwidth())
    .attr('rx', 6)
    .attr('fill', 'rgba(255,255,255,.03)')
    .attr('stroke', 'rgba(255,255,255,.04)');

  // circles: encode direction by color and magnitude by radius
  const cells = g.append('g')
    .selectAll('circle')
    .data(data.matrix)
    .enter().append('circle')
      .attr('class','cell')
      .attr('cx', d => x(d.tf) + x.bandwidth()/2)
      .attr('cy', d => y(d.tissue) + y.bandwidth()/2)
      .attr('r', d => r(d.total))
      .attr('fill', d => d.total===0 ? 'rgba(255,255,255,.08)' : signedColor(d.score))
      .attr('opacity', d => d.total===0 ? 0.35 : 0.92)
      .attr('stroke', 'rgba(0,0,0,.0)');

  // dotted overlay for imputed cells (structural zeros)
  g.append('g')
    .selectAll('circle.imputedDot')
    .data(data.matrix.filter(d => d.imputed))
    .enter().append('circle')
      .attr('class','imputedDot')
      .attr('cx', d => x(d.tf) + x.bandwidth()/2)
      .attr('cy', d => y(d.tissue) + y.bandwidth()/2)
      .attr('r', 2.2)
      .attr('fill', 'rgba(255,255,255,.45)');

  // interactions: hover updates infobox & mini chart, click pins selection and updates bar chart
  cells
    .on('mousemove', (event, d) => {
      state.hovered = d;
      if(!state.pinned){
        updateDetails(d, 'hover');
      }
      tooltip
        .style('opacity', 1)
        .style('left', (event.pageX + 12) + 'px')
        .style('top', (event.pageY + 12) + 'px')
        .html(
          `<b>${d.tissue}</b> × <b>${d.tf}</b><br/>
           total: ${fmt(d.total)} records<br/>
           signed proportion: ${fmt2(d.score)}${d.imputed?'<br/><span style="color:#ffcc66">imputed structural zero</span>':''}`
        );
    })
    .on('mouseleave', () => {
      tooltip.style('opacity', 0);
      state.hovered = null;
      if(!state.pinned){
        updateDetails(null);
      }
    })
    .on('click', (event, d) => {
      // toggle pin if clicking same cell
      if(state.pinned && state.pinned.tissue===d.tissue && state.pinned.tf===d.tf){
        state.pinned = null;
        d3.selectAll('.cell').classed('pinned', false);
        updateDetails(state.hovered, 'hover');
        // reset bars to first TF in current subset
        drawBars(data, data.tfs[0]);
      } else {
        state.pinned = {tissue:d.tissue, tf:d.tf};
        d3.selectAll('.cell').classed('pinned', c => c.tissue===d.tissue && c.tf===d.tf);
        updateDetails(d, 'pin');
        drawBars(data, d.tf);
      }
    });
}

function drawBars(data, selectedTF){
  const svg = d3.select('#barSvg');
  svg.selectAll('*').remove();

  const container = document.getElementById('bars');
  const width = container.clientWidth - 24;
  const height = container.clientHeight - 44;

  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const margin = {top: 24, right: 20, bottom: 48, left: 70};
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Build series: for each tissue, get plus/minus/unknown for that TF
  const series = data.tissues.map(t => {
    const rec = data.matrix.find(d => d.tissue===t && d.tf===selectedTF);
    return {
      tissue: t,
      plus: rec?.plus ?? 0,
      minus: rec?.minus ?? 0,
      unknown: rec?.unknown ?? 0,
      total: rec?.total ?? 0,
      imputed: rec?.imputed ?? true,
      score: rec?.score ?? 0
    };
  });

  // stacked bars for +, -, unknown
  const keys = ['plus','minus','unknown'];
  const colors = {plus:'#b40426', minus:'#3b4cc0', unknown:'#9aa7c7'};

  const x = d3.scaleBand().domain(series.map(d=>d.tissue)).range([0, iw]).padding(0.22);
  const y = d3.scaleLinear().domain([0, d3.max(series, d=>d.total) || 1]).nice().range([ih, 0]);

  g.append('g').attr('class','axis')
    .attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
      .attr('transform','rotate(-25)')
      .attr('text-anchor','end')
      .attr('dx','-0.4em')
      .attr('dy','0.15em');

  g.append('g').attr('class','axis')
    .call(d3.axisLeft(y).ticks(5).tickFormat(fmt));

  // y-axis label with unit
  g.append('text')
    .attr('x', -margin.left + 2)
    .attr('y', -8)
    .attr('fill','rgba(255,255,255,.65)')
    .attr('font-size', 12)
    .text('Count (records)');

  // title
  svg.append('text')
    .attr('x', margin.left)
    .attr('y', 18)
    .attr('fill', 'rgba(255,255,255,.85)')
    .attr('font-size', 13)
    .attr('font-weight', 700)
    .text(`TF = ${selectedTF} (stacked counts by direction)`);

  const stack = d3.stack().keys(keys);
  const stacked = stack(series);

  // bars
  g.append('g')
    .selectAll('g')
    .data(stacked)
    .enter().append('g')
      .attr('fill', d => colors[d.key])
    .selectAll('rect')
    .data(d => d.map(v => ({key: d.key, tissue: v.data.tissue, imputed: v.data.imputed, total: v.data.total, score: v.data.score, v0: v[0], v1: v[1]})))
    .enter().append('rect')
      .attr('x', d => x(d.tissue))
      .attr('y', d => y(d.v1))
      .attr('height', d => y(d.v0) - y(d.v1))
      .attr('width', x.bandwidth())
      .attr('opacity', d => d.total===0 ? 0.25 : 0.95)
      .attr('stroke', d => d.imputed ? 'rgba(255,255,255,.55)' : 'none')
      .attr('stroke-dasharray', d => d.imputed ? '3,2' : null)
      .on('mousemove', (event, d) => {
        tooltip
          .style('opacity', 1)
          .style('left', (event.pageX + 12) + 'px')
          .style('top', (event.pageY + 12) + 'px')
          .html(
            `<b>${selectedTF}</b> in <b>${d.tissue}</b><br/>
             signed proportion: ${fmt2(d.score)}<br/>
             total: ${fmt(d.total)} records${d.imputed?'<br/><span style="color:#ffcc66">imputed structural zero</span>':''}`
          );
      })
      .on('mouseleave', () => tooltip.style('opacity', 0));

  // top labels
  g.append('g')
    .selectAll('text')
    .data(series)
    .enter().append('text')
      .attr('x', d => x(d.tissue) + x.bandwidth()/2)
      .attr('y', d => y(d.total) - 6)
      .attr('text-anchor','middle')
      .attr('fill', 'rgba(255,255,255,.75)')
      .attr('font-size', 11)
      .text(d => d.total ? fmt(d.total) : '0');

  // legend
  const leg = svg.append('g').attr('transform', `translate(${width-200}, ${18})`);
  const items = [{k:'plus', label:'+'},{k:'minus', label:'−'},{k:'unknown', label:'?'}];
  leg.selectAll('g')
    .data(items)
    .enter().append('g')
      .attr('transform', (d,i)=>`translate(${i*60},0)`)
      .each(function(d){
        const gg = d3.select(this);
        gg.append('rect').attr('x',0).attr('y',-10).attr('width',14).attr('height',14).attr('rx',4).attr('fill', colors[d.k]);
        gg.append('text').attr('x',18).attr('y',2).attr('fill','rgba(255,255,255,.75)').attr('font-size',11).text(d.label);
      });
}

function wireUI(){
  d3.select('#tfCount').on('change', (event) => {
    state.tfCount = +event.target.value;
    state.pinned = null;
    tooltip.style('opacity', 0);
    render();
  });

  d3.select('#clearPin').on('click', () => {
    state.pinned = null;
    d3.selectAll('.cell').classed('pinned', false);
    updateDetails(null);
  });

  window.addEventListener('resize', () => {
    if(!state.data) return;
    render();
  });
}

loadData().then(data => {
  state.data = data;
  wireUI();
  render();
}).catch(err => {
  console.error(err);
  d3.select('#status').text('Failed to load data. Make sure you run a local web server.');
});
