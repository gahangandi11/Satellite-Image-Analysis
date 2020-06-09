//import the landsat8 data from google earth engine and name it l8
//filter the images according to date you are interested
var imagecoll=l8.filterDate('2018-01-01','2018-12-30');


//as most of the images will have cloud cover,remove the cloud cover using inbuilt functions for landsat images
var cloudless =imagecoll.map(function(image) {
  var cloudy = ee.Algorithms.Landsat.simpleCloudScore(image).select('cloud');
  //mask the parts of image where cloud cover is greater than 20 percetage
  var mask = cloudy.lte(20);
  return image.updateMask(mask);
});


//get a single composite image by taking median at each pixel 
var med=cloudless.median();


//download a feature collection for indian boundary 
//and clip the median composite to ind to get image within indian boundary
var clip=med.clipToCollection(ind)

//select the bands B4,B3,B2 to view the true image
var vis={bands:['B4','B3','B2'],max:0.3};

//add the true layer to map
Map.addLayer(clip,vis,'true')

//select the band B5 from the clip
var nir = clip.select('B5');

//select the band B4 from the clip
var red = clip.select('B4');

//calculate (B5-B4)/(B5+B4) at each pixel 
//this gives normalised difference vegitation index
var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
var ndviParams = {min: -1, max: 1, palette: ['blue', 'white', 'green']};
Map.addLayer(ndvi, ndviParams, 'NDVI image');

//calculate the normalised difference water index
var ndwi = clip.normalizedDifference(['B3', 'B5']);
var ndwiViz = {min: 0.5, max: 1, palette: ['44c9f1', '1637f1']};
Map.addLayer(ndwi, ndwiViz, 'NDWI');

// Mask the non-watery parts of the image, where NDWI < 0.10.
var ndwiMasked = ndwi.updateMask(ndwi.gte(0.10));
Map.addLayer(ndwiMasked, ndwiViz, 'NDWI masked');

//Now for classification you need  to get the training data
//create the classes forest,water,urban,agriculture under the category landcover as feature collection
// and collect some training points for each class by manually dropping point

var classNames=forest.merge(water).merge(urban).merge(agriculture);
var bands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7'];
var training = clip.select(bands).sampleRegions({
  collection:classNames ,
  properties: ['landcover'],
  scale: 30
});



var withRandom = training.randomColumn('random');
var split = 0.7;  // Roughly 70% training, 30% testing.
var trainingPartition = withRandom.filter(ee.Filter.lt('random', split));
var testingPartition = withRandom.filter(ee.Filter.gte('random', split));
//train the classifier using cart
var classifier = ee.Classifier.cart().train({
  features: trainingPartition,
  classProperty: 'landcover',
  inputProperties: bands
});



//Run the classification
var classified = clip.select(bands).classify(classifier);
Map.addLayer(classified,{min: 0, max: 3, palette: [ 'green','blue', 'red','yellow']},'classification');



// Classify the test FeatureCollection.
var test = testingPartition.classify(classifier);
// Print the confusion matrix.
var confusionMatrix = test.errorMatrix('landcover', 'classification');
print('Confusion Matrix', confusionMatrix);
print('Validation overall accuracy: ', confusionMatrix.accuracy());


//calculating the area of urban class

var wat=classified.select('classification').eq(3);
var area_wat = wat.multiply(ee.Image.pixelArea()).divide(1000*1000);
var area =area_wat.reduceRegion({
    reducer:ee.Reducer.sum(),
    geometry:ind,
    scale:30,
   // maxPixels: 1e9,
    bestEffort:true
});
print(area)

//exporting the image
Export.image.toDrive({
  image: classified,
  description: 'my_classification',
  scale: 30,
  maxPixels:1e11,
  region:ind
  pyramidingPolicy: {'.default': 'mode'}
})



