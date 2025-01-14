import type {
    CreateParams,
    CreateResult,
    DataProvider,
    DeleteManyParams,
    DeleteManyResult,
    DeleteParams,
    DeleteResult,
    GetListParams,
    GetListResult,
    GetManyParams,
    GetManyReferenceParams,
    GetManyReferenceResult,
    GetManyResult,
    GetOneParams,
    GetOneResult,
    RaRecord,
    UpdateManyParams,
    UpdateManyResult,
    UpdateParams,
    UpdateResult
} from "ra-core";

import {
    fetchUtils
} from "ra-core";

/**
 * Maps react-admin queries to a TreeQL powered REST API
 *
 * @see https://treeql.org
 *
 * @example
 *
 * getList          => GET http://my.api.url/records/posts?order=title,ASC&page=1,25
 * getOne           => GET http://my.api.url/records/posts/123
 * getMany          => GET http://my.api.url/records/posts?123,456,789
 * getManyReference => GET http://my.api.url/records/posts?filter=author_id,eq,345
 * update           => PUT http://my.api.url/records/posts/123
 * updateMany       => PUT http://my.api.url/records/posts/123,456,789
 * create           => POST http://my.api.url/records/posts/123
 * delete           => DELETE http://my.api.url/records/posts/123
 * deleteMany       => DELETE http://my.api.url/records/posts/123,456,789
 *
 * @example
 *
 * import * as React from "react";
 * import { Admin, Resource } from 'react-admin';
 * import treeqlProvider from 'ra-data-treeql';
 *
 * import { PostList } from './posts';
 *
 * const App = () => (
 *     <Admin dataProvider={treeqlProvider('http://my.api.url/')}>
 *         <Resource name="posts" list={PostList} />
 *     </Admin>
 * );
 *
 * export default App;
 */

/** see https://github.com/mevdschee/php-crud-api#filters */
const filterOperators = [
    "cs", // contain string (string contains value)
    "sw", // start with (string starts with value)
    "ew", // end with (string end with value)
    "eq", // equal (string or number matches exactly)
    "lt", // lower than (number is lower than value)
    "le", // lower or equal (number is lower than or equal to value)
    "ge", // greater or equal (number is higher than or equal to value)
    "gt", // greater than (number is higher than value)
    "bt", // between (number is between two comma separated values)
    "in", // in (number or string is in comma separated list of values)
    "is", // is null (field contains "NULL" value)
] as const;

/** see https://marmelab.com/react-admin/FilteringTutorial.html#filter-operators */
const searchOperator = "q" as const; // default search operator of react-admin
const APISearchParam = "search" as const; // default search param of TreeQL
const APIFilterParam = "filter" as const; // filter param of TreeQL

type FilterOperator = typeof filterOperators[number];

const isValidFilterOperator = (value: any): value is FilterOperator => filterOperators.includes(value);

const formatFilter = (filter: Record<string, any>): [string, string][] => Object.entries(filter).map(([key, value]) => {
    if (key === searchOperator) {
        return [APISearchParam, value];
    }

    let operator: FilterOperator = "eq";
    const suffix = key.slice(-2);
    if (key.slice(-3, -2) === "_" && isValidFilterOperator(suffix)) {
        operator = suffix;
        return [APIFilterParam, [key.slice(0, -3), operator, formatFilterArguments(operator, value)].filter(v => !!v).join(",")];
    }
    if (key.slice(-4, -2) === "_n" && isValidFilterOperator(suffix)) {
        // negated operators
        operator = suffix;
        return [APIFilterParam, [key.slice(0, -4), "n" + operator, formatFilterArguments(operator, value)].filter(v => !!v).join(",")];
    }

    return [APIFilterParam, `${key},eq,${value}`];
});

const formatFilterArguments = (operator: FilterOperator, value: any): string => {
    switch (operator) {
        case "bt":
            if (!Array.isArray(value)) { throw new TypeError("Array expected as filter value for filter type \"between\" (bt)") }
            return `${value[0]},${value[1]}`;

        case "in":
            if (!Array.isArray(value)) { throw new TypeError("Array expected as filter value for filter type \"in\"") }
            return value.join(",");

        case "is":
            return null; // is null filter doesn't require any arguments

        default:
            return value;
    }
};

interface IParams {
    order: string;
    page: string;
    filter: Record<string, any>;
    [key: string]: any;
}

export const formatParams = (rawParams?: IParams): string => {
    if (!rawParams) { return ""; }
    const { filter, ...rest } = rawParams;

    const urlParams = new URLSearchParams(rest);
    formatFilter(filter).forEach(([key, value]) => urlParams.append(key, value));

    return "?" + decodeURIComponent(urlParams.toString());
};

export class TreeQLDataProvider<ResourceType extends string = string> implements DataProvider<ResourceType> {

    private apiUrl: string;
    public constructor(_apiUrl: ResourceType, private httpClient = fetchUtils.fetchJson) {
        this.apiUrl = _apiUrl.endsWith("/") ? _apiUrl.slice(0, -1) : _apiUrl;
    }

    public async getList<RecordType extends RaRecord = any>(resource: ResourceType, params: GetListParams): Promise<GetListResult<RecordType>> {
        const { sort, pagination, filter } = params;
        const { page, perPage } = pagination;
        const { field, order } = sort;
        const url = this.getURL(resource, {
            order: `${field},${order}`,
            page: `${page},${perPage}`,
            filter
        });

        const { json: { records, results } } = await this.httpClient(url);
        return ({
            data: records,
            total: results,
        });
    }

    public async getOne<RecordType extends RaRecord = any>(resource: ResourceType, params: GetOneParams<RecordType>): Promise<GetOneResult<RecordType>> {
        const { json } = await this.httpClient(`${this.getURL(resource)}/${params.id}`);
        return ({ data: json });
    }

    public async getMany<RecordType extends RaRecord = any>(resource: ResourceType, params: GetManyParams): Promise<GetManyResult<RecordType>> {
        const url = `${this.getURL(resource)}/${params.ids.join(',')}`;
        const { json } = await this.httpClient(url);
        return ({ data: Array.isArray(json) ? json : [json] });
    }

    public async getManyReference<RecordType extends RaRecord = any>(resource: ResourceType, params: GetManyReferenceParams): Promise<GetManyReferenceResult<RecordType>> {
        const { id, target, sort, pagination, filter } = params;
        const { page, perPage } = pagination;
        const { field, order } = sort;
        const url = this.getURL(resource, {
            order: `${field},${order}`,
            page: `${page},${perPage}`,
            filter: {
                ...filter,
                [target]: id
            }
        });

        const { json: { records, results } } = await this.httpClient(url);
        return ({
            data: records,
            total: results,
        });
    }

    public async update<RecordType extends RaRecord = any>(resource: ResourceType, params: UpdateParams<RecordType>): Promise<UpdateResult<RecordType>> {
        const { id, data, previousData } = params
        await this.httpClient(`${this.getURL(resource)}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return {
            data: {
                id,
                ...previousData,
                ...data
            }
        };
    }

    public async updateMany<RecordType extends RaRecord = any>(resource: ResourceType, params: UpdateManyParams): Promise<UpdateManyResult<RecordType>> {
        const { ids, data } = params;
        await this.httpClient(`${this.getURL(resource)}/${ids.join(',')}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        // TODO: there's no previous data for updateMany... do we need to return complete records?
        return { data: ids };
    }

    public async create<RecordType extends RaRecord = any>(resource: ResourceType, params: CreateParams): Promise<CreateResult<RecordType>> {
        const { data } = params;
        const { json } = await this.httpClient(`${this.getURL(resource)}`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return ({
            data: { ...data, id: json },
        });
    }

    public async delete<RecordType extends RaRecord = any>(resource: ResourceType, params: DeleteParams<RecordType>): Promise<DeleteResult<RecordType>> {
        const { id, previousData } = params
        await this.httpClient(`${this.getURL(resource)}/${id}`, {
            method: 'DELETE',
        });
        return ({
            data: {
                id,
                ...previousData
            }
        });
    }

    public async deleteMany<RecordType extends RaRecord = any>(resource: ResourceType, params: DeleteManyParams<RecordType>): Promise<DeleteManyResult<RecordType>> {
        const { ids } = params;
        await this.httpClient(`${this.getURL(resource)}/${ids.join(',')}`, {
            method: 'DELETE',
        });
        return ({ data: ids });
    }

    protected getURL(resource: string, params?: IParams) {
        return `${this.apiUrl}/records/${resource}${formatParams(params)}`;
    }
}

const getDataProvider = (apiUrl: string, httpClient?: typeof fetchUtils.fetchJson) => new TreeQLDataProvider(apiUrl, httpClient);

export default getDataProvider;
