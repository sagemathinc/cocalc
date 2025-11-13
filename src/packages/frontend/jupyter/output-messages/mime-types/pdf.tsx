import register from "./register";
import { PDF } from "../pdf";

/*
# You can make this appear using this code:

from IPython.display import display
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from io import BytesIO

def create_pdf():
    # alternatively, for a file a.pdf
    #    return open('a.pdf','rb').read()
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    p.drawString(100, 500, "Hello, World!")
    p.showPage()
    p.save()
    pdf = buffer.getvalue()
    buffer.close()
    return pdf

pdf_data = create_pdf()
display({'application/pdf': pdf_data}, raw=True)
*/
register("application/pdf", 6, ({ id, value, actions }) => {
  if (value == null) {
    console.warn("PDF: value must be specified");
    return <pre>Invalid PDF output</pre>;
  }
  return <PDF value={value} actions={actions} id={id} />;
});
