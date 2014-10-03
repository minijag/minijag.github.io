// Depends on SelectionManager.js and drawChart.js

// A little pretend like I'm getting a JSON object from server.
products = [
   {
      symbol:'FMAGX',
      product:'Fidelity Magellan',
      risk:16.96,
      annualReturn:10.99
   },
   {
      symbol:'BFOCX',
      product:'Berkshire:Focus',
      risk:19.82,
      annualReturn:17.74
   },
   {
      symbol:'ADTRX',
      product:'Alpine:Trans;Inst',
      risk:19.38,
      annualReturn:12.84
   },
   {
      symbol:'RFG',
      product:'Guggenheim S&P MC 400 P Gro',
      risk:17.83,
      annualReturn:19.88
   },
   {
      symbol:'VAGGX',
      product:'Delaware Sel Gro;Inst',
      risk:15.04,
      annualReturn:19.42
   }
];

var selectionManager = new SelectionManager

selectionManager.setItems(products);

function addSymbolListener(symbol) {
  document.getElementById(symbol).onmouseover = function () {selectionManager.setSelected(symbol, true)}
  document.getElementById(symbol).onmouseout = function () {selectionManager.setSelected(symbol, false)}
}
// Add's listeners using the addSymbolLister function to solve common closure and referencing issue.
for (var i = 0; i < products.length; i++) {
  var symbol = products[i]['symbol'];
  addSymbolListener(symbol);
}

// Add the table selection highlight listener.
selectionManager.addListener(function (item, selected){
  if (selected == true) {
    document.getElementById(item).style.backgroundColor = 'rgb(205, 233, 255)';
  } else {
    document.getElementById(item).style.backgroundColor = 'white';
  }
})


drawChart(selectionManager, 4, products, 'Risk', 'Return', '%', '%');
