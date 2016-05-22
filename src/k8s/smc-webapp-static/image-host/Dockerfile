FROM nginx
MAINTAINER William Stein <wstein@sagemath.com>
COPY default.conf /etc/nginx/conf.d/default.conf
COPY static static
CMD ["nginx", "-g", "daemon off;"]

