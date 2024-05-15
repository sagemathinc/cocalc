export type Example = [display: string, prompt: string, tags: string[]];
type Language = "python" | "r" | "sagemath" | "octave" | "julia";

export const JUPYTER: { [key in Language]: Example[] } = {
  python: [
    [
      "Linear Regression Analysis",
      "Create a linear regression model to predict house prices based on square footage, number of bedrooms, and location.",
      ["machine learning", "statistics", "regression"],
    ],
    [
      "Time Series Analysis",
      "Fit a statistical model to this time series of monthly values: 72, 42, 63, 44, 46, 51, 47, 39, 21, 31, 19, 22. Then plot it with extrapolation.",
      ["machine learning", "statistics", "regression"],
    ],
    [
      "Plotting a Sine Wave",
      "Generate a plot of a sine wave with varying frequencies and amplitudes.",
      ["visualization", "mathematics", "trigonometry"],
    ],
    [
      "Basic Data Analysis with Pandas",
      "Generate a string containing CSV data for a fictional dataset about movies (Title, Year, Genre, Length (min), Rating (0 to 5)). Create a a Pandas DataFrame reading in that string via StringIO. Print the DataFrame. Calculate summary statistics (mean, median, standard deviation) for all numerical columns.",
      ["data analysis", "pandas", "statistics"],
    ],
    [
      "Machine Learning with Scikit-Learn",
      "Use `sklearn.datasets.load_wine` to load the wine dataset. Train a linear regression model on this dataset. Evaluate the model's performance using R-squared. Make predictions on new data.",
      ["machine learning", "scikit-learn", "regression"],
    ],
    [
      "Fibonacci Sequence",
      "Write a recursive function to generate the Fibonacci sequence up to a given number of terms. Then use it to print the first 10 fibonacci numbers.",
      ["mathematics", "algorithms"],
    ],
    [
      "DNA Sequence Analysis",
      "Create a program to generate a random DNA sequence and calculate the GC content (percentage of guanine and cytosine bases).",
      ["bioinformatics", "genetics"],
    ],
  ],
  r: [
    [
      "Data Summary and Visualization",
      "Provide a summary of the iris dataset and create a scatter plot matrix to visualize the relationships between different variables.",
      ["data analysis", "visualization"],
    ],
    [
      "Time Series Analysis",
      "Perform a time series analysis on monthly sales data and forecast future sales using ARIMA model.",
      ["time series", "forecasting"],
    ],
    [
      "Statistical Analysis with R",
      "Perform a t-test to compare the means of two groups. Visualize the results using a boxplot. Check the assumptions of the t-test.",
      ["t-test"],
    ],
    [
      "ANOVA",
      "Perform a one-way analysis of variance (ANOVA) on a dataset to compare means across multiple groups.",
      ["statistics", "experimental design"],
    ],
    [
      "Data Manipulation with dplyr",
      "Filter rows based on specific conditions. Group data by a categorical variable. Summarize data using aggregate functions.",
      ["data", "tidyverse"],
    ],
    [
      "Graphics with ggplot2",
      "Create a bar chart showing the frequency of different categories. Add error bars to represent standard deviation. Facet the plot by another variable.",
      ["visualization", "ggplot2"],
    ],
  ],
  sagemath: [
    [
      "Symbolic Algebra with SageMath",
      "Solve a system of linear equations. Factor a polynomial. Find the eigenvalues and eigenvectors of a matrix.",
      ["algebra", "symbolic computation", "linear algebra"],
    ],
    [
      "Calculus with SageMath",
      "Calculate the derivative of a function. Find the definite integral of a function. Solve a differential equation.",
      ["calculus", "symbolic computation", "differential equations"],
    ],
    [
      "Symbolic Integration",
      "Use SageMath to symbolically integrate a complex function.",
      ["mathematics", "calculus"],
    ],
    [
      "Random Matrix",
      "Generate a random 5x5 matrix over GF_2 and calculate its determinant.",
      ["mathematics", "random"],
    ],
    [
      "Matrix Operations",
      "Perform various matrix operations like addition, multiplication, and finding the inverse using SageMath.",
      ["linear algebra", "mathematics"],
    ],
    [
      "Solving Differential Equations",
      "Solve the differential equation dy/dx = x^2 + y^2 using SageMath.",
      ["differential equations", "calculus", "mathematics"],
    ],
    [
      "Prime Number Generation",
      "Generate a list of prime numbers up to 1000 using SageMath.",
      ["number theory", "mathematics", "algorithms"],
    ],
  ],
  octave: [
    [
      "Matrix Operations",
      "Perform basic matrix operations (addition, multiplication, inversion) on some random matrices.",
      ["linear algebra", "matrix operations"],
    ],
    [
      "Signal Processing",
      "Apply a Fourier Transform to a signal and plot its frequency spectrum.",
      ["signal processing", "fourier transform"],
    ],
    [
      "Low-pass filter",
      "Apply a low-pass filter to a randomly generated signal and visualize the results.",
      ["signal processing", "engineering"],
    ],
    [
      "Numerical Linear Algebra with Octave",
      "Solve a system of linear equations. Calculate the determinant and inverse of a matrix. Perform singular value decomposition (SVD).",
      ["numerical analysis", "linear algebra", "matrix operations"],
    ],
    [
      "Optimization with Octave",
      "Find the minimum of a function using gradient descent. Solve a constrained optimization problem using fmincon.",
      ["optimization", "numerical analysis"],
    ],
    [
      "10x10 Multiplication Table",
      "Generate a 10x10 multiplication table using `[1:10]' .* [1:10]` and exaplain what happend.",
      ["matrix operations"],
    ],
  ],
  julia: [
    [
      "Numerical Integration",
      "Implement numerical integration using the trapezoidal rule for a given function.",
      ["numerical methods", "calculus", "mathematics"],
    ],
    [
      "Statistical Analysis",
      "Conduct a statistical analysis on a dataset and visualize the results with plots.",
      ["data analysis", "statistics", "visualization"],
    ],
    [
      "Numerically ODE Solving",
      "Implement a numerical method for solving ordinary differential equations (e.g., Euler's method). Vectorize operations for improved performance.",
      ["scientific computing", "numerical analysis", "differential equations"],
    ],
    [
      "Monte Carlo Simulation",
      "Use Julia to perform a Monte Carlo simulation to estimate the value of pi.",
      ["mathematics", "simulation", "statistics"],
    ],
  ],
} as const;

export const LATEX: Example[] = [
  [
    "Article",
    "A template for writing a research article, including sections for abstract, introduction, methodology, results, discussion, and conclusion.",
    ["research", "academic", "journal"],
  ],
  [
    "Article IEEE",
    "A template for writing a research article submitted to IEEE.",
    ["research", "academic", "journal"],
  ],
  [
    "Resume",
    "A template for creating a professional resume, with sections for personal information, education, work experience, skills, and references.",
    ["job", "career", "application"],
  ],
  [
    "Letter",
    "A template for writing a formal letter, including sections for the sender's address, date, recipient's address, salutation, body, and closing.",
    ["correspondence", "official", "business"],
  ],
  [
    "Presentation",
    "A template for creating a slide presentation, with a title slide, section slides, and a slide for references or additional information.",
    ["slides", "presentation", "conference"],
  ],
  [
    "Book",
    "A template for writing a book, including sections for the cover page, table of contents, chapters, and back matter (appendices, glossary, etc.).",
    ["novel", "story", "literature"],
  ],
  [
    "Report",
    "A template for generating a comprehensive report, with sections for an executive summary, introduction, detailed analysis, recommendations, and appendices.",
    ["analysis", "business", "technical"],
  ],
  [
    "Scientific Poster",
    "Template for a academic conference poster. The document must be a single page and position graphic and text objects onto it. The topic should be something fun to get started - for example 'newly discovered rhytmic beats of rotating black holes'.",
    ["poster", "academic", "conference"],
  ],
  [
    "Lab Report",
    "Template for recording scientific experiments and findings.",
    ["lab", "report", "science"],
  ],
  [
    "Homework Assignment",
    "Clean layout for homework submissions.",
    ["homework", "assignment", "school"],
  ],
  [
    "Exam",
    "Template for creating structured exams or quizzes.",
    ["exam", "quiz", "test"],
  ],
  [
    "Newsletter",
    "Template for designing and distributing newsletters.",
    ["newsletter", "communication"],
  ],
  [
    "Recipe",
    "Beautifully formatted template for sharing culinary creations.",
    ["recipe", "cooking", "food"],
  ],
  [
    "Invoice",
    "Professional template for billing clients or customers.",
    ["invoice", "billing", "payment"],
  ],
  [
    "Calendar",
    "Template for yearly, monthly, or weekly calendars.",
    ["calendar", "planner", "schedule"],
  ],
  [
    "Poetry/Prose",
    "Elegant layout for showcasing creative writing.",
    ["poetry", "prose", "writing"],
  ],
  [
    "Photo Album",
    "Visually appealing template for displaying photographs.",
    ["photo", "album", "gallery"],
  ],
  [
    "Scrapbook",
    "Creative template for personal mementos and memories.",
    ["scrapbook", "journal", "memory"],
  ],
] as const;
