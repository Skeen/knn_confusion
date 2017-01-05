#!/usr/bin/env node
'use strict';

var readline = require('readline');
var pjson = require('./package.json');
var fs = require('fs');

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
		var weightf = function(distance)
    	{
            switch(options.weight)
            {
                case "d":
                    // Trunc to 1 to avoid NaNs
                    return Math.min(1, 1 / distance);

                case "ds":
                    // Trunc to 1 to avoid NaNs
    	            return Math.min(1, 1 / (distance * distance));

                case "gk":
                    var sigma = 100;
                    var r = -1*distance*distance/(2*sigma*sigma);
                    return Math.exp(r);

                // Either 'v' or 'unset'
                case "v":
                case undefined:
                    return 1;

                default:
                    console.error();
                    console.error("Fatal error: Invalid weight function");
                    console.error();
                    process.exit(1);
            }
		}

        var weights = element.neighbours.map(function(neighbour)
        {
            var weight = weightf(neighbour.distance);
            return {tag : neighbour.tag, weight : weight};
        });

        var total_weight = weights.reduce(function(acc, weight)
        {
            return acc + weight.weight
        }, 0);

        weights.forEach(function(weight)
        {
            var val = weight.weight / total_weight;
            fill(element.ground_truth.tag, weight.tag, val);
        });
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
						console.error("Neighbour not included in model", site.tag)
						process.exit(1);
					}
					var conf_interval_upper = parseFloat(site_model.mean) + num_dev*site_model.std_dev;
					var conf_interval_lower = parseFloat(site_model.mean) - num_dev*site_model.std_dev;
					var result = site.distance < conf_interval_upper && site.distance > conf_interval_lower;
					//if(element.ground_truth.tag == "BestBuy.com")
					//console.log(result,"=",conf_interval_upper, ">" , site.distance, ">", conf_interval_lower);
					var filter = site.distance < conf_interval_upper && site.distance > conf_interval_lower;
					if(options.verbose && !filter)
					{
						console.error("Neighbour was filtered", site.tag);
					}
					return filter;
				});
			//console.log("neighbours", element.neighbours.length);
			if(element.neighbours.length < 1)
			{
				if(options.verbose)
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
						var filter = site_occurances > cutoff;
						if(options.verbose && !filter)
						{
							console.error("site filtered after cutoff", site.tag)
						}

						return filter;
					});

				if(element.neighbours.length < 1)
				{
					if(options.verbose)
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
  //.option('-c, --fractional-cutoff', 'Remove neighbours with low likeliness', parseFloat)
  .option('-k, --knn <number>', 'Consider only the \'k\' nearest neighbours', parseInt)
  .option('-w, --weight <name>', 'Utilize the specified weight function; <name> can be:' + '\n' +
          '\t* <d> \tInverse distance' + '\n' +
          '\t* <ds> \tInverse distance squared' + '\n' +
          '\t* <gk> \tGuassian kerneling' + '\n' +
          '\t* <v> \tPure voting (default)')
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
    // If input is '{}'
    if(Object.keys(json).length === 0 && json.constructor === Object)
    {
        console.log("{}");
        return;
    }

    if(options.verbose)
    {
        console.error("Input json:");
        console.error(json);
        console.error();
    }

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
