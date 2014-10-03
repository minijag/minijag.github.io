// Depends on SelectionManager.js
function drawChart(selectionManager, numberOfMarkers, products, xAxisLabel, yAxisLabel, xUnit, yUnit) {
  var selectionManager = selectionManager;
  // Setting up SVG Area.
  var draw = SVG('drawing').size(500, 500);
  var chart = draw.rect(500, 300).attr({
    fill: 'rgb(255, 253, 241)'
  });
  var marginPx = 50;
  var totalLabelOnXYAxis = numberOfMarkers;

  // Calculates maximum values to display for X and Y axis on graph.
  var maximumDataValueY = 0;
  for (var i = 0; i < products.length; i++) {
    var arrVal = products[i];
    var barVal = arrVal['annualReturn'];
    if (barVal > maximumDataValueY)
      maximumDataValueY = barVal;
  }
  maximumDataValueY = Math.ceil(maximumDataValueY * 1.25);
  var maximumDataValueX = 0;
  for (var i = 0; i < products.length; i++) {
    var arrVal = products[i];
    var barVal = arrVal['risk'];
    if (barVal > maximumDataValueX)
      maximumDataValueX = barVal;
  }
  maximumDataValueX = Math.ceil(maximumDataValueX * 1.25);

  // Drawing X and Y axis.
  var yLine = draw.line(marginPx, 250, marginPx, 30).stroke({
    width: 2
  });
  var xLine = draw.line(marginPx, 250, 400, 250).stroke({
    width: 2
  });

  // Height and Width of the X and Y axis.
  var chartWidth = xLine.width();
  var chartHeight = yLine.height();

  // Distance between each marker.
  var barHeight = chartHeight / totalLabelOnXYAxis;
  var barWidth = chartWidth / totalLabelOnXYAxis;

  // Draws markers on each axis.
  function drawAxisMarkers() {
    var markerStep = maximumDataValueY / totalLabelOnXYAxis;
    // On Y Axis
    for (var i = 0; i <= totalLabelOnXYAxis; i++) {
      var markerVal = i * markerStep;
      var markerValHt = i * barHeight - 30;
      markerValHt = parseInt(chartHeight - markerValHt);
      draw.line(50, markerValHt, 400, markerValHt).stroke({
        width: .5
      });
      var text = draw.text(markerVal.toString() + yUnit).move(0, markerValHt);
      text.font({
        family: 'Helvetica',
        size: 11
      })
    }

    var markerStep = maximumDataValueX / totalLabelOnXYAxis;
    // On X Axis.
    for (var i = 0; i <= totalLabelOnXYAxis; i++) {
      var markerVal = i * markerStep;
      var markerValWidth = parseInt(i * barWidth + marginPx);
      draw.line(markerValWidth, 280, markerValWidth, 250).stroke({
        width: .5
      });
      var text = draw.text(markerVal.toString() + xUnit).move(markerValWidth, 280);
      text.font({
        family: 'Helvetica',
        size: 11
      })
    }
    // Draws the unit measurement label on each axis.  Example: ft, miles, years, %
    draw.text(yAxisLabel)
    draw.text(xAxisLabel).move(marginPx + chartWidth, 240)
  }

  // Plots data points on the graph.
  function drawPoints(products) {
    var risk;
    var theReturn;
    var pointSize;
    var cIdtogId = {};
    for (var i = 0; i < products.length; i++) {
      risk = products[i]['risk'];
      theReturn = products[i]['annualReturn'];
      pSize = 8;
      var xPos = (risk / maximumDataValueX) * (chartWidth) + marginPx;
      var yPos = 30 + chartHeight - (theReturn / maximumDataValueY * chartHeight);
      var svgPoint = draw.rect(pSize, pSize).move(xPos - (pSize / 2), yPos - (pSize / 2)).attr({
        fill: 'rgba(223, 83, 83, 0.7)'
      });
      // Rotates to make it look like a diamond.
      svgPoint.rotate(45)
      svgPoint.product = products[i];
      cIdtogId[svgPoint.product.symbol] = svgPoint.node.id;

      // Fires select event on mouseover and mouseout from svgPoint
      svgPoint.mouseover(function() {
        var theSymbol = this.product['symbol'];
        selectionManager.setSelected(theSymbol, true)
      })
      svgPoint.mouseout(function() {
        var theSymbol = this.product['symbol'];
        selectionManager.setSelected(theSymbol, false)
      })

    }
    // Graph selection highlighter
    selectionManager.addListener(function(productSymbol, selected) {
      if (selected) {
        var thatSvgId = cIdtogId[productSymbol];
        SVG.get(thatSvgId).attr({
          fill: 'rgb(0, 0, 0)'
        });
      } else {
        var thatSvgId = cIdtogId[productSymbol];
        SVG.get(thatSvgId).attr({
          fill: 'rgba(223, 83, 83, 0.7)'
        });
      }
    })
  }
  drawAxisMarkers();
  drawPoints(products);
}
