var tweetArray = [
  {name: "Ashley", tweet: "I love #coke, I shared it with Cthulu", image: "img/cat.jpeg"},
  {name: "Sarah", tweet: "mmm, Mexican #coke", image: "img/girl.jpeg"},
  {name: "martha", tweet: "Dont make me laugh because I will #explodemycoke, #coke", image: "img/lemon.jpeg"},
  {name: "Bob", tweet: "The name of the Wind by Patrick Rothfuss #coke", image: "img/peach.jpeg"},
  {name: "Sarah", tweet: "I am watching television and drinking #coke", image: "img/pizza.jpeg"},
  {name: "Trixkie", tweet: "I love #coke, I shared it with you dad", image: "img/strawberry.jpeg"},
  {name: "phillip", tweet: "I love #coke, I thanks tint", image: "img/watermelon.jpeg"}
]

var tac = 0

$(".createYups").on('click', function(e){
  e.preventDefault();
  var rColor = Math.floor(Math.random()*16777215).toString(16);

  $('.box').append(  "<div class='yup resizable' style='background-color: #"+rColor+"'> <div class='insideYup'><img class='avatar' src='" + tweetArray[tac]['image'] + "'> </img> <span> @" + tweetArray[tac]['name'] + " </span><i class='fa fa-facebook' style='float: right; position: relative; margin: 8px 16px;'></i><i class='fa fa-twitter' style='float: right; position: relative; margin: 8px 16px;'></i></div><p style='font-size: 11px; position: relative; left: 13px; color: whitesmoke; top: 5px'> aug 21st </p><span> " + tweetArray[tac]['tweet'] + " </span></div>" )
  $(".resizable" ).resizable({
    containment: ".rightCol",
    minWidth: 220,
    minHeight: 120
  });
  changeText('.yup')
  tac = tac + 1
  if (tac >= 6) {
    tac = 0
  }
})
$(function() {
  $( "#sortable" ).sortable();
});
$(function() {
  $(".resizable" ).resizable({
    containment: ".rightCol",
    minWidth: 220,
    minHeight: 120
  });
});
function getRandomInt (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
//Using jQuery to get/set the values
function changeText(datInput){

    var rgb = $(datInput).last().css('background-color');
    var hex = rgb2hex(rgb)

    if(getBrightness(hex) < 160){
      thatYup = $('.yup').last()
      thatYup.attr('style', function(index, attr) {
        return "color: white; " + attr;
      });
      thatYup.find('.insideYup').attr('style', function(index, attr) {
        return "background-color: rgba(0, 0, 0, 0.5); " + attr;
      })
    } else {
      thatYup = $('.yup').last()
      thatYup.attr('style', function(index, attr) {
        return "color: black; " + attr;
      });
      thatYup.find('.insideYup').attr('style', function(index, attr) {
        return "background-color: rgba(0, 0, 0, 0.5); " + attr;
      })
    }
 
};
 
function getBrightness(hex) {

    var hex = hex.replace('#','');
 
    var c_r = hexDec(hex.substr(0, 2));
    var c_g = hexDec(hex.substr(2, 2));
    var c_b = hexDec(hex.substr(4, 2));
 
    return ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
}
function darken(hex) {

    var hex = hex.replace('#','');
 
    var c_r = hexDec(hex.substr(0, 2));
    var c_g = hexDec(hex.substr(2, 2));
    var c_b = hexDec(hex.substr(4, 2));
 
    return ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
}
 
function hexDec(hex_string){
    hex_string = (hex_string+'').replace(/[^a-f0-9]/gi, '');
    return parseInt(hex_string, 16);
}
function rgb2hex(rgb) {
    rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    function hex(x) {
        return ("0" + parseInt(x).toString(16)).slice(-2);
    }
    return "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
}
