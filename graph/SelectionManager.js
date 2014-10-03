function SelectionManager() {}

SelectionManager.prototype.selectedItems = {};

SelectionManager.prototype.callbacks = [];

SelectionManager.prototype.items;

SelectionManager.prototype.isSelected = function (item) {
  // Return false if item has never been selected.
  return !!this.selectedItems[item];
}

// Setting list of displayed products.
// Takes array of objects that contain the key 'symbol'
SelectionManager.prototype.setItems = function (items) {
  if (typeof this.items != 'undefined') {
    throw "You can only set items once.";
  }
  var newArray = []
  for (var i = 0; i < items.length; i++){
    newArray[i] = items[i]['symbol']
  }
  this.items = newArray;
}

// Changing selection status on chart
SelectionManager.prototype.setSelected = function (item, selected) {
  // If item is not a legal item.
  if (this.items.indexOf(item) == -1){
    // Do nothing.
    throw "Not a legal item"
  }
  // If the item is already selected.
  if (this.selectedItems[item] == selected) {
    // Do nothing.
    return
  }

  this.selectedItems[item] = selected;

  // Notify listeners of the selection change.
  for (var i = 0; i < this.callbacks.length ; i++) {
    this.callbacks[i](item, selected);
  }
}

SelectionManager.prototype.addListener = function (callback) {
  this.callbacks.push(callback);
}


