curl -X POST -u sk_BS9fVpiEpPpJbhSZurAMSnmM: http://localhost:50195/api/v1/ping

curl -X POST -d title='API project' -d description='Stuff' -u sk_BS9fVpiEpPpJbhSZurAMSnmM: http://localhost:50195/api/v1/create_project

curl -d first_name=API -d last_name=gal -d email_address=a@b -d password=666 -d agreed_to_terms=true http://localhost:54249/api/v1/create_account

curl -d command="ls -al" -d project_id="72b622c0-665d-4512-8bc6-197ecdba1d8b" http://localhost:54249/api/v1/project_exec

curl -d path='a.txt' -d project_id="72b622c0-665d-4512-8bc6-197ecdba1d8b" http://localhost:54249/api/v1/read_text_file_from_project

curl -d content='foo bar' -d path='a.txt' -d project_id="72b622c0-665d-4512-8bc6-197ecdba1d8b" http://localhost:54249/api/v1/write_text_file_to_project