###
# Misc. CoffeeScript functions that might are needed elsewhere
###

# Return a random element of an array
exports.random_choice = (array) -> array[Math.floor(Math.random() * array.length)]