// cSpell:ignore  fmincon xaringan tsfeatures Koma scrartcl scrbook scrletter scrreprt transposons

export type Example = readonly [
  display: string,
  prompt: string,
  tags: readonly string[],
];
type Language = "python" | "r" | "sagemath" | "octave" | "julia";

export const EXAMPLES_COMMON: readonly Example[] = [
  [
    "Help me Study...",
    "I am a student. I want to learn more about a topic. Explain it to me using code, formulas and plots!\n\nTopic: DESCRIBE_TOPIC_HERE",
    ["student", "learning"],
  ],
] as const;

export const JUPYTER: { [key in Language]: readonly Example[] } = {
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
      "Generate a plot of x*a*sin(b*x) with varying frequencies (b) and amplitudes (a). Use the IPywidgets.interact wrapper to make the plots interactive.",
      ["visualization", "mathematics", "trigonometry"],
    ],
    [
      "Basic Data Analysis with Pandas",
      "Generate a string containing CSV data for a fictional dataset about movies (Title, Year, Genre, Length (min), Rating (0 to 5)). Create a a Pandas DataFrame reading in that string via StringIO. Print the DataFrame. Calculate summary statistics (mean, median, standard deviation) for all numerical columns.",
      ["data analysis", "pandas", "statistics"],
    ],
    [
      "Machine Learning with Scikit-Learn",
      "Load the wine dataset from sklearn.datasets. Preprocess the data if necessary (e.g., standardize features). Fit a linear regression model to the wine data.  Evaluate the model's performance using R-squared and mean squared error (MSE). Then, visualize the relationship between actual and predicted values using a scatter plot.",
      ["machine learning", "scikit-learn", "regression"],
    ],
    [
      "Fibonacci Sequence",
      "Write a recursive function to generate the Fibonacci sequence up to a given number of terms. Then use it to print the first 10 fibonacci numbers.",
      ["mathematics", "algorithms"],
    ],
    [
      "DNA Sequence Analysis",
      "Generate DNA sequence data of length 10000. It should contain random coding regions with realistic codon usage bias, promoter regions with over-represented transcription factor binding sites, repetitive elements like transposons and tandem repeats, and regions with different GC content to simulate genomic islands. Then, create a function that analyzes the k-mer distributions in that sequence, highlighting over-represented motifs. Then plot this!",
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
      "Generate a 10x10 multiplication table using `[1:10]' .* [1:10]` and explain what happened.",
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

// supported extensions
const EXTS = ["tex", "rmd", "ipynb", "qmd", "md", "ipynb-sagemath"] as const;
export type Ext = (typeof EXTS)[number];
export function isSupportedExtension(ext?: string): ext is Ext {
  return typeof ext === "string" && EXTS.includes(ext as any);
}

export const PAPER_SIZE: { [ext in Ext]?: string[] } = {
  tex: ["Letter (US)", "Legal (US)", "A4 (Europe)", "A5 (Europe)"],
};

const RMD_QMD: readonly Example[] = [
  [
    "Markdown Tutorial",
    "Provide a step-by-step tutorial on how to use Markdown for creating documents.",
    ["tutorial", "markdown"],
  ],
  [
    "Data Exploration",
    "An RMarkdown document to explore a dataset using summary statistics, distributions, and relationships between variables.",
    ["data exploration", "eda", "visualization"],
  ],
  [
    "Data Visualization",
    "Generate a comprehensive visualization of the dataset using various ggplot2 plots.",
    ["visualization", "ggplot2"],
  ],
  [
    "Regression Analysis",
    "A template to perform regression analysis on a dataset using R, including model selection, diagnostics, and interpretation.",
    ["regression", "statistics", "modeling"],
  ],
  [
    "Machine Learning Model",
    "An RMarkdown to build and evaluate a machine learning model using popular R libraries like caret or tidymodels.",
    ["machine learning", "prediction", "modeling"],
  ],
  [
    "Time Series Analysis",
    "A template to analyze time series data using R packages like forecast or tsfeatures.",
    ["time series", "forecasting", "trend analysis"],
  ],
  [
    "Publication-Ready Manuscript",
    "An RMarkdown document formatted for submission to a scientific journal, including figures, tables, and references.",
    ["manuscript", "publication", "scientific writing"],
  ],
  [
    "Presentation Slides",
    "A template for creating presentation slides using RMarkdown and packages like xaringan or remark.js.",
    ["presentation", "slides", "xaringan", "remark.js"],
  ],
  [
    "Tutorial or Workshop",
    "A structured document for teaching R concepts, with explanations, code examples, and exercises.",
    ["tutorial", "workshop", "education"],
  ],
  [
    "EDA",
    "Conduct an exploratory data analysis (EDA) on the dataset and summarize the findings.",
    ["EDA", "exploration"],
  ],
  [
    "Financial Report",
    "Generate a financial report including tables, plots, and a summary analysis.",
    ["financial", "report"],
  ],
  [
    "Bioinformatics Report",
    "Analyze biological data and present the findings in a detailed report.",
    ["bioinformatics", "report"],
  ],
  [
    "Survey Analysis",
    "Analyze survey data, including descriptive statistics and visualizations.",
    ["survey", "analysis"],
  ],
  [
    "Geospatial Analysis",
    "Perform geospatial analysis and visualize the results using maps.",
    ["geospatial", "maps"],
  ],
  [
    "Climate Data Analysis",
    "Analyze climate data and present trends and patterns.",
    ["climate", "data analysis"],
  ],
  [
    "Sales Report",
    "Generate a sales report with data visualizations and summary statistics.",
    ["sales", "report"],
  ],
] as const;

export const DOCUMENT: { [ext in Ext]: readonly Example[] } = {
  ipynb: [["Test", "Random numbers", ["testing"]]],
  "ipynb-sagemath": [
    [
      "Test",
      "Explain how to compute the differential of a function",
      ["testing"],
    ],
  ],
  tex: [
    [
      "Article",
      "A template for writing a research article, including sections for abstract, introduction, methodology, results, discussion, and conclusion.",
      ["research", "academic"],
    ],
    [
      "Article IEEE",
      "A template for writing a research article submitted to IEEE.",
      ["research", "academic", "ieee"],
    ],
    [
      "Article SIAM",
      "A template for writing a research article submitted to SIAM.",
      ["research", "academic", "siam"],
    ],
    [
      "Resume",
      "A template for creating a professional resume, with sections for personal information, education, work experience, skills, and references.",
      ["resume"],
    ],
    [
      "Letter",
      "A template for writing a formal letter, including sections for the sender's address, date, recipient's address, salutation, body, and closing.",
      ["official", "business"],
    ],
    [
      "Presentation",
      "A template for creating a slide presentation, with a title slide, section slides, and a slide for references or additional information.",
      ["slides", "presentation"],
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
      "Koma-Script/Article",
      "Generate a template using the Koma-Script 'scrartcl' document class. Use a modern font and small padding.",
      ["koma-script", "article"],
    ],
    [
      "Koma-Script/Book",
      "Generate a template using the Koma-Script 'scrbook' document class. Use a modern font and small padding.",
      ["koma-script", "book"],
    ],
    [
      "Koma-Script/Letter",
      "Generate a template using the Koma-Script 'scrletter' document class. Use a modern font and small padding.",
      ["koma-script", "letter"],
    ],
    [
      "Koma-Script/Report",
      "Generate a template using the Koma-Script 'scrreprt' document class. Use a modern font and small padding.",
      ["koma-script", "report"],
    ],
    [
      "Scientific Poster",
      "Template for a academic conference poster. The document must be a single page and position graphic and text objects onto it. The topic should be something fun to get started - for example 'newly discovered rhythmic beats of rotating black holes'.",
      ["poster", "academic", "conference"],
    ],
    [
      "Lab Report",
      "Template for recording scientific experiments and findings. Use tables to record date/time, observation, notes, etc.",
      ["science"],
    ],
    [
      "Homework Assignment",
      "Clean layout for homework submissions. Header should start with the student name, class, id number, etc..",
      ["homework"],
    ],
    [
      "Exam/Quiz",
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
      ["recipe", "cooking"],
    ],
    [
      "Invoice",
      "Professional template for billing clients or customers. All required aspects of a valid invoice must be included. Generate a random company name.",
      ["invoice"],
    ],
    [
      "Calendar",
      "Template for yearly, monthly, or weekly calendars.",
      ["calendar", "schedule"],
    ],
    [
      "Poetry/Writing",
      "Elegant layout for showcasing creative writing.",
      ["poetry", "writing"],
    ],
    [
      "Scrapbook",
      "Creative template for personal mementos and memories.",
      ["scrapbook", "journal"],
    ],
  ],
  rmd: RMD_QMD,
  qmd: RMD_QMD,
  md: [
    [
      "Markdown Tutorial",
      "Provide a step-by-step tutorial on how to use Markdown for creating documents.",
      ["tutorial", "markdown"],
    ],
    [
      "Embedded Python Code",
      "Show and explain how to plot x * sin(x) using matplotlib in a \n\n```python\n...\n```\n code block.",
      ["tutorial", "python"],
    ],
    [
      "Lab Report",
      "Template for recording scientific experiments and findings. Use tables to record date/time, observation, notes, etc.",
      ["science"],
    ],
    ["Notes", "Template for making notes, etc.", ["notes"]],
  ],
} as const;
