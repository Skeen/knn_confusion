#!/usr/bin/env node
'use strict';

var readline = require('readline');
var pjson = require('./package.json');
var fs = require('fs');

function calculate_weights(element)
{
    // Weight function, '1 / distance' ensures that the closest neighbours count the most
    var weightf = function(distance)
    {
        // Trunc to 1 to avoid NaNs
        return Math.min(1, 1 / distance);
    }

    var weights = {};
    element.neighbours.forEach(function(neighbour)
    {
        weights[neighbour.tag] = (weights[neighbour.tag] || {});
        weights[neighbour.tag].weight = (weights[neighbour.tag].weight || 0) + weightf(neighbour.distance);
        weights[neighbour.tag].count = (weights[neighbour.tag].count || 0) + 1;
    });
    return weights;
}

function calculate_percentages(weights)
{
    var sum = Object.keys(weights).reduce(function(acc, key)
    {
        var elem = weights[key];
        var avg_weight = (elem.weight / elem.count);
        return acc + avg_weight;
    }, 0);
    //console.log("sum", sum);

    var percentages = Object.keys(weights).reduce(function(acc, key)
    {
        var elem = weights[key];
        var avg_weight = (elem.weight / elem.count);
        acc[key] = avg_weight / sum;
        return acc;
    }, {});
    //console.log("percent", percentages);

    return percentages;
}

function data_to_confusion(data, opt)
{
    var confusion_matrix = {};

    var fill = function(ground, neighbour, increment)
    {
        //console.log("Increasing", ground, "x", neighbour, "with", increment);
        confusion_matrix[ground] = (confusion_matrix[ground] || {});
        confusion_matrix[ground][neighbour] = (confusion_matrix[ground][neighbour] || 0) + increment;
    }


    // Start counting
    data.forEach(function(element)
    {
    	var weights = calculate_weights(element);
        var percentages = calculate_percentages(weights);

		if(opt.fractional)
		{
       		Object.keys(percentages).forEach(function(key)
			{
        	    var elem = percentages[key];
				//console.log("key: ", key, " value: ", elem);
	
    	        fill(element.ground_truth.tag, key, elem);
	        });
		}
		else if(opt.fractInt)
		{
			var percentages_arr = Object.keys(percentages);
			percentages_arr.sort(function(a,b)
			{
				return percentages[a] - percentages[b];
			});
	
			percentages_arr.length = Math.min(opt.fractInt, percentages_arr.length);

			var sum = percentages_arr.reduce(function(acc, key)
				{
					return acc + percentages[key];
				}, 0);
				
			percentages_arr.forEach(function(key)
			{
				var val = percentages[key] / sum;
				fill(element.ground_truth.tag, key, val);
			});
		}
		else
		{
            // Find the nearest neighbour
            var nearest_neighbour = element.neighbours.reduce(function(a,b)
            {
                return (a.distance < b.distance) ? a : b;
            });

            fill(element.ground_truth.tag, nearest_neighbour.tag, 1);
		}
    });

    return confusion_matrix;
}

var BigNumber = require('bignumber.js');
BigNumber.config({DECIMAL_PLACES: 10, ROUNDING_MODE: 4})
function roundAt(num, n)
{
	var floored = Math.floor(num);
	var scaler = Math.pow(10,n);
	var scaled = Math.round((num-floored)*scaler)/scaler;
	return floored + scaled;
}
function modelling(json)
{
	var data = json.reduce(
		function(acc, query)
		{
			var tag = query.ground_truth.tag;
			var filtered = query.neighbours.filter(
				function(neighbour)
				{
					return neighbour.tag == tag;
				});
			var sum = filtered.reduce(
					function(sum, element)
					{
						return sum + element.distance;
					}, 0);
			
			acc[tag] = (acc[tag] || {});
			if(acc[tag].neighbours)
				acc[tag].neighbours = acc[tag].neighbours.concat(filtered);
			else
				acc[tag].neighbours = filtered;
			acc[tag].sum = (acc[tag].sum || 0) + sum;
			return acc;
		}, {});
	
	var modelled = Object.keys(data).map(
		function(tag)
		{
			var site = data[tag];
			var mean = new BigNumber(roundAt(site.sum, 5)).div(site.neighbours.length);
			var variance = site.neighbours.reduce(
				function(sum, neighbour)
				{
					return sum.plus((new BigNumber(neighbour.distance).sub(mean)).pow(2));
				}, new BigNumber(0));
			variance = variance.div(site.neighbours.length);
			return {tag : tag, mean : mean, std_dev : variance.sqrt().toString(), variance : variance};
		});
	return modelled;
}

function statistics(json, model, num_dev, cutoff)
{
	var json = json.filter(
		function(element)
		{
			element.neighbours = element.neighbours.filter(
				function(site)
				{
					var site_model = model.find(
						function(model_site)
						{
							return(model_site.tag == site.tag);
						});
					if(site_model === undefined)
					{
						console.error("Neighbour not included in model", site_model)
						return false;
					}
					var conf_interval_upper = parseFloat(site_model.mean) + num_dev*site_model.std_dev;
					var conf_interval_lower = parseFloat(site_model.mean) - num_dev*site_model.std_dev;
					var result = site.distance < conf_interval_upper && site.distance > conf_interval_lower;
					//if(element.ground_truth.tag == "BestBuy.com")
					//console.log(result,"=",conf_interval_upper, ">" , site.distance, ">", conf_interval_lower);
					return site.distance < conf_interval_upper && site.distance > conf_interval_lower;
				});
			//console.log("neighbours", element.neighbours.length);
			if(element.neighbours.length < 1)
			{
				console.error("Unclassifiable:", element.ground_truth.UID);
				return false;
			}
			else
				return true;
		});

	// If a cutoff is defined, remove neighbours
	// with has less than cutoff likely neighbours of the same tag.
	if(cutoff)
	{
		var site_name = "";
		var site_occurances = Number.NEGATIVE_INFINITY;
		
		json = json.filter(
			function(element)
			{
				//Remove elements if there arent enough occurances of that site left.
				element.neighbours = element.neighbours.filter(
					function(site)
					{
						// Get number of occurances of this site, 
						// if thats not already what is saved.
						if(site.tag != site_name)
						{
							//console.log("site name was changed:", site_name, "site tag:",  site.tag)
							site_name = site.tag;
							site_occurances = element.neighbours.reduce(
								function(sum, e)
								{
									//console.log("tag",e.tag,"name",site_name)
									if(e.tag == site_name)
										return sum+1;
									else
										return sum;
								}, 0);
						}
						return site_occurances > cutoff;
					});

				if(element.neighbours.length < 1)
				{
					console.error("Unclassifiable after cutoff:", element.ground_truth.UID);
					return false;
				}
				else
					return true;

			});
	}

	return json;
}

function k_nearest(json, n)
{
	return json.map(
		function(element)
		{
			element.neighbours.sort(
				function(a, b)
				{
					return a.distance - b.distance;
				});
			element.neighbours.length = Math.min(n, element.neighbours.length);
			return element;
		});

}

var options = require('commander');

options
  .version(pjson.version)
  .description(pjson.description + ".")
  .usage('[options]')
  .option('-v, --verbose', 'Print more information')
  .option('-m, --modelling', 'Perform modelling to get mean and standard deviation')
  .option('-S, --statistics <file>', 'Use statistical modelling to exclude unlikely neighbours')
  .option('-,--')
  .option('-,--', 'Requires Statistics:')
  .option('-n, --statistics-deviation <number>', 'Number of standard deviations to use.', parseFloat)
  .option('-q, --statistics-cutoff <number>', 'Cut neighbours of site, if less than n are statistically likely.', parseInt)
  //.option('-p, --statistics-cutoff-percentage <number>', 'Cut neighbours of site, if less than n% are statistically likely.', parseFloat)
  .option('-,--', '')
  .option('-,--', 'Confusion-Matrix:')
  .option('-f, --fractional', 'Generate a fractional confusion matrix')
  .option('-F, --fractInt <number>', 'Generate confusion matrix using fractionals, but only with n largest', parseInt)
  //.option('-c, --fractional-cutoff', 'Remove neighbours with low likeliness', parseFloat)
  .option('-k, --knn <number>', 'Consider only the \'k\' nearest neighbours', parseInt)
  //.option('-w, --weight <name>', 'Utilize the specified weight function')
  .option('-h, --help', '');

// Addition help
options.on('--help', function()
{
    console.log('  Examples:');
    console.log('');
    console.log('    $ cat input.json | ./index.js \t\t# Output a shortest-distance confusion matrix');
    console.log('    $ cat input.json | ./index.js -f \t\t# Output a fractional confusion matrix');
    console.log('    $ cat input.json | ./index.js -f -k5 \t# Output a fractional confusion matrix using 5 neighbours');
    console.log('');
});

// Capture the internal helper
var internal_help = options.help;

// Parse argv
options.parse(process.argv);

// Utilize our modified helper
var help = function()
{
    internal_help.bind(options)(function(value)
    {
        var help = value.split('\n');
        // Find our marker and use it to create categories
        var new_help = help.map(function(line)
        {
            var marker = line.indexOf("-,--");
            if(marker != -1)
            {
                return "   " + line.substr(marker+4).trim();
            }
            return line;
        }).filter(function(line)
        {
            return line.indexOf("-h, --help") == -1;
        });
        //console.log(new_help);

        return new_help.join('\n');
    });
}

// Was -h, or --help passed?
if(options.help == undefined)
    help();

var read_timeseries = function(callback)
{
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    var input = "";
    rl.on('line', function(line)
    {
        input += line;
    });

    rl.on('close', function()
    {
        var json;
        try
        {
            json = JSON.parse(input);
        }
        catch(err)
        {
            console.error();
            console.error("Fatal error: Piped input is not valid JSON!");
            console.error();
            console.error(err);
            process.exit(1);
        }

        callback(json);
    });
};

read_timeseries(function(json)
{
    if(options.verbose)
    {
        console.log("Input json:");
        console.log(json);
        console.log();
    }

	// DEBUGGING TODO: REMOVE THESE
	/*
	json = json.filter(function(e)
		{
			e.ground_truth.tag == "BestBuy.com";
		});
	*/
	/*
	json = json.filter(function(e)
		{
			return e.ground_truth.tag == "BestBuy.com";
		});
	*/

	// Filter out neighbours with distance 0, 
	// there shouldnt be any, but do it just in case.
	json.forEach(function(e)
		{
			e.neighbours = e.neighbours.filter(function(site)
				{
					return site.distance > 0;
				});
		})

	// Determine the mean and standard deviation
	//  then add these to the json.
	if(options.modelling)
	{
		var out = modelling(json);
		console.log(JSON.stringify(out));
		return;
	}

	if(options.statistics)
	{
		var model_input = fs.readFileSync(options.statistics);
		var model = JSON.parse(model_input);
	
		var num_dev = options.statisticsDeviation || 1.5;

		var cutoff = options.statisticsCutoff || 0;

		json = statistics(json, model, num_dev, cutoff);
	}

	// Keep only the k neighbours with smallest distance
	if(options.knn > 0)
	{
		json = k_nearest(json, options.knn);
	}

    var confusion = data_to_confusion(json, options);
    console.log(JSON.stringify(confusion));
});
