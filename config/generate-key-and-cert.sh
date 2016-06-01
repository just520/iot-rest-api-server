cd "$(dirname "$0")"

if test "x$1x" == "xx"; then
  FQDN="localhost"
else
  FQDN=$1
fi

if test "x$2x" == "xx"; then
  IP="127.0.0.1"
else
  IP=$2
fi

openssl genrsa 2048 > private.key
openssl req -new -sha256 -key private.key -out cert.csr \
  -subj "/C=FI/O=Intel OTC/CN=${FQDN} subjectAltName=${IP}"

openssl x509 \
  -req \
  -days 365 \
  -in cert.csr \
  -signkey private.key \
  -out certificate.pem \

rm cert.csr
